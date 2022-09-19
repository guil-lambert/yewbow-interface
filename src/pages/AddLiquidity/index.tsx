import { BigNumber } from '@ethersproject/bignumber'
import { TransactionResponse } from '@ethersproject/providers'
import { Trans } from '@lingui/macro'
import { Currency, CurrencyAmount, Percent } from '@uniswap/sdk-core'
import { FeeAmount, NonfungiblePositionManager, Pool } from '@uniswap/v3-sdk'
import { DarkCard, LightCard } from 'components/Card'
import DowntimeWarning from 'components/DowntimeWarning'
import Loader from 'components/Loader'
import UnsupportedCurrencyFooter from 'components/swap/UnsupportedCurrencyFooter'
import { erf, log } from 'mathjs'
import { useCallback, useContext, useEffect, useState } from 'react'
import Collapsible from 'react-collapsible'
import { AlertTriangle } from 'react-feather'
import ReactGA from 'react-ga'
import { Link, RouteComponentProps } from 'react-router-dom'
import { Text } from 'rebass'
import {
  Area,
  ComposedChart,
  LabelList,
  Line,
  ReferenceArea,
  ReferenceLine,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import {
  useRangeHopCallbacks,
  useV3DerivedMintInfo,
  useV3MintActionHandlers,
  useV3MintState,
} from 'state/mint/v3/hooks'
import { ThemeContext } from 'styled-components/macro'

import { ButtonError, ButtonLight, ButtonPrimary, ButtonText, ButtonYellow } from '../../components/Button'
import { BlueCard, OutlineCard, YellowCard } from '../../components/Card'
import { AutoColumn } from '../../components/Column'
import CurrencyInputPanel from '../../components/CurrencyInputPanel'
import FeeSelector from '../../components/FeeSelector'
import HoverInlineText from '../../components/HoverInlineText'
import LiquidityChartRangeInput from '../../components/LiquidityChartRangeInput'
import { AddRemoveTabs } from '../../components/NavigationTabs'
import { PositionPreview } from '../../components/PositionPreview'
import RangeSelector from '../../components/RangeSelector'
import PresetsButtons from '../../components/RangeSelector/PresetsButtons'
import RateToggle from '../../components/RateToggle'
import Row, { AutoRow, RowBetween, RowFixed } from '../../components/Row'
import Slider from '../../components/Slider'
import { SwitchLocaleLink } from '../../components/SwitchLocaleLink'
import TransactionConfirmationModal, { ConfirmationModalContent } from '../../components/TransactionConfirmationModal'
import { NONFUNGIBLE_POSITION_MANAGER_ADDRESSES } from '../../constants/addresses'
import { CHAIN_INFO, SupportedChainId } from '../../constants/chains'
import { ZERO_PERCENT } from '../../constants/misc'
import { WETH9_EXTENDED } from '../../constants/tokens'
import { useCurrency } from '../../hooks/Tokens'
import { ApprovalState, useApproveCallback } from '../../hooks/useApproveCallback'
import { useArgentWalletContract } from '../../hooks/useArgentWalletContract'
import { useV3NFTPositionManagerContract } from '../../hooks/useContract'
import useDebouncedChangeHandler from '../../hooks/useDebouncedChangeHandler'
import { useDerivedPositionInfo } from '../../hooks/useDerivedPositionInfo'
import { useIsSwapUnsupported } from '../../hooks/useIsSwapUnsupported'
import useTransactionDeadline from '../../hooks/useTransactionDeadline'
import { useUSDCValue } from '../../hooks/useUSDCPrice'
import useUSDCPrice from '../../hooks/useUSDCPrice'
import { useAllPositions, useV3PositionFromTokenId } from '../../hooks/useV3Positions'
import { useActiveWeb3React } from '../../hooks/web3'
import { useWalletModalToggle } from '../../state/application/hooks'
import { Bound, Field } from '../../state/mint/v3/actions'
import { TransactionType } from '../../state/transactions/actions'
import { useTransactionAdder } from '../../state/transactions/hooks'
import { useIsExpertMode, useUserSlippageToleranceWithDefault } from '../../state/user/hooks'
import { ExternalLink, TYPE } from '../../theme'
import approveAmountCalldata from '../../utils/approveAmountCalldata'
import { calculateGasMargin } from '../../utils/calculateGasMargin'
import { currencyId } from '../../utils/currencyId'
import { maxAmountSpend } from '../../utils/maxAmountSpend'
import { Dots, MaxButton } from '../Pool/styleds'
import { Review } from './Review'
import {
  CurrencyDropdown,
  DynamicSection,
  HideMedium,
  MediumOnly,
  PageWrapper,
  ResponsiveTwoColumns,
  RightContainer,
  ScrollablePage,
  StackedContainer,
  StackedItem,
  StyledInput,
  Wrapper,
} from './styled'

const DEFAULT_ADD_IN_RANGE_SLIPPAGE_TOLERANCE = new Percent(50, 10_000)

export default function AddLiquidity({
  match: {
    params: { currencyIdA, currencyIdB, feeAmount: feeAmountFromUrl, tokenId },
  },
  history,
}: RouteComponentProps<{ currencyIdA?: string; currencyIdB?: string; feeAmount?: string; tokenId?: string }>) {
  const { account, chainId, library } = useActiveWeb3React()
  const theme = useContext(ThemeContext)
  const toggleWalletModal = useWalletModalToggle() // toggle wallet when disconnected
  const expertMode = useIsExpertMode()
  const addTransaction = useTransactionAdder()
  const positionManager = useV3NFTPositionManagerContract()
  // check for existing position if tokenId in url
  const { position: existingPositionDetails, loading: positionLoading } = useV3PositionFromTokenId(
    tokenId ? BigNumber.from(tokenId) : undefined
  )
  const hasExistingPosition = !!existingPositionDetails && !positionLoading
  const { position: existingPosition } = useDerivedPositionInfo(existingPositionDetails)

  // fee selection from url
  const feeAmount: FeeAmount | undefined =
    feeAmountFromUrl && Object.values(FeeAmount).includes(parseFloat(feeAmountFromUrl))
      ? parseFloat(feeAmountFromUrl)
      : undefined

  const baseCurrency = useCurrency(currencyIdA)
  const currencyB = useCurrency(currencyIdB)
  // prevent an error if they input ETH/WETH
  const quoteCurrency =
    baseCurrency && currencyB && baseCurrency.wrapped.equals(currencyB.wrapped) ? undefined : currencyB

  // mint state
  const { independentField, typedValue, startPriceTypedValue } = useV3MintState()

  const {
    pool,
    ticks,
    dependentField,
    price,
    pricesAtTicks,
    parsedAmounts,
    currencyBalances,
    position,
    noLiquidity,
    currencies,
    errorMessage,
    invalidPool,
    invalidRange,
    outOfRange,
    depositADisabled,
    depositBDisabled,
    invertPrice,
    ticksAtLimit,
  } = useV3DerivedMintInfo(
    baseCurrency ?? undefined,
    quoteCurrency ?? undefined,
    feeAmount,
    baseCurrency ?? undefined,
    existingPosition
  )
  const poolAddress =
    baseCurrency && quoteCurrency && feeAmount
      ? Pool.getAddress(baseCurrency?.wrapped, quoteCurrency?.wrapped, feeAmount)
      : ' '
  const poolPositions = useAllPositions('0x', poolAddress.toLowerCase(), '0', 1000)
  const positions = useAllPositions(account ? account : undefined, poolAddress.toLowerCase(), '0', 1000)
  const { onFieldAInput, onFieldBInput, onLeftRangeInput, onRightRangeInput, onStartPriceInput } =
    useV3MintActionHandlers(noLiquidity)

  const isValid = !errorMessage && !invalidRange

  const currentPosition = poolPositions.positions ? poolPositions.positions : 0
  const ETHprice = useUSDCPrice(WETH9_EXTENDED[chainId ?? 1] ?? undefined)
  const tickX =
    currentPosition != 0
      ? (currentPosition[0].pool.liquidity *
          (1.0001 ** (-currentPosition[0].pool.tick / 2 + currentPosition[0].pool.feeTier / 200) -
            1.0001 ** (-currentPosition[0].pool.tick / 2 - currentPosition[0].pool.feeTier / 200))) /
        10 ** currentPosition[0].token0.decimals
      : 0
  const tickY =
    currentPosition != 0
      ? (currentPosition[0].pool.liquidity *
          (1.0001 ** (currentPosition[0].pool.tick / 2 + currentPosition[0].pool.feeTier / 200) -
            1.0001 ** (currentPosition[0].pool.tick / 2 - currentPosition[0].pool.feeTier / 200))) /
        10 ** currentPosition[0].token1.decimals
      : 0
  const tickTVL =
    currentPosition != 0
      ? currentPosition[0].token0.derivedETH == 1
        ? tickX * parseFloat(ETHprice ? ETHprice.toFixed(2) : '1')
        : tickY * parseFloat(ETHprice ? ETHprice.toFixed(2) : '1')
      : 1

  const dayData = currentPosition != 0 ? currentPosition[0].pool.poolDayData : 0
  const volumeUSD = dayData != 0 ? dayData[0].volumeUSD : 1
  const volatility =
    currentPosition != 0 ? (2 * currentPosition[0].pool.feeTier * (volumeUSD / tickTVL) ** 0.5) / 1000000 : 0

  // Data
  const startDate = currentPosition != 0 ? currentPosition[0].transaction.timestamp : undefined
  const endDate =
    currentPosition != 0 && currentPosition[0].pool.poolDayData[0]
      ? currentPosition[0].pool.poolDayData[0].date
      : undefined

  const dayData0 = currentPosition != 0 ? currentPosition[0].pool.poolDayData.slice(0, 180) : 0
  const dayData1 =
    dayData0 != 0
      ? dayData0.map((i: any) => {
          return {
            date: i.date,
            price: invertPrice ? parseFloat(i.token0Price).toPrecision(4) : parseFloat(i.token1Price).toPrecision(4),
          }
        })
      : [{ date: 0, price: 0 }]

  const minPrice = Math.min(...dayData1.map((i) => Number(i.price)))
  const maxPrice = Math.max(...dayData1.map((i) => Number(i.price)))

  // modal and loading
  const [showConfirm, setShowConfirm] = useState<boolean>(false)
  const [attemptingTxn, setAttemptingTxn] = useState<boolean>(false) // clicked confirm

  // capital efficiency warning
  const [showCapitalEfficiencyWarning, setShowCapitalEfficiencyWarning] = useState(false)

  useEffect(() => setShowCapitalEfficiencyWarning(false), [baseCurrency, quoteCurrency, feeAmount])

  // txn values
  const deadline = useTransactionDeadline() // custom from users settings

  const [txHash, setTxHash] = useState<string>('')

  // get formatted amounts
  const formattedAmounts = {
    [independentField]: typedValue,
    [dependentField]: parsedAmounts[dependentField]?.toSignificant(6) ?? '',
  }

  const usdcValues = {
    [Field.CURRENCY_A]: useUSDCValue(parsedAmounts[Field.CURRENCY_A]),
    [Field.CURRENCY_B]: useUSDCValue(parsedAmounts[Field.CURRENCY_B]),
  }

  // get the max amounts user can add
  const maxAmounts: { [field in Field]?: CurrencyAmount<Currency> } = [Field.CURRENCY_A, Field.CURRENCY_B].reduce(
    (accumulator, field) => {
      return {
        ...accumulator,
        [field]: maxAmountSpend(currencyBalances[field]),
      }
    },
    {}
  )

  const atMaxAmounts: { [field in Field]?: CurrencyAmount<Currency> } = [Field.CURRENCY_A, Field.CURRENCY_B].reduce(
    (accumulator, field) => {
      return {
        ...accumulator,
        [field]: maxAmounts[field]?.equalTo(parsedAmounts[field] ?? '0'),
      }
    },
    {}
  )

  const argentWalletContract = useArgentWalletContract()

  // check whether the user has approved the router on the tokens
  const [approvalA, approveACallback] = useApproveCallback(
    argentWalletContract ? undefined : parsedAmounts[Field.CURRENCY_A],
    chainId ? NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[chainId] : undefined
  )
  const [approvalB, approveBCallback] = useApproveCallback(
    argentWalletContract ? undefined : parsedAmounts[Field.CURRENCY_B],
    chainId ? NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[chainId] : undefined
  )

  const allowedSlippage = useUserSlippageToleranceWithDefault(
    outOfRange ? ZERO_PERCENT : DEFAULT_ADD_IN_RANGE_SLIPPAGE_TOLERANCE
  )

  // only called on optimism, atm
  async function onCreate() {
    if (!chainId || !library) return

    if (chainId && library && position && account && deadline && baseCurrency && quoteCurrency && positionManager) {
      const { calldata, value } = NonfungiblePositionManager.createCallParameters(position.pool)

      const txn: { to: string; data: string; value: string } = {
        to: NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[chainId],
        data: calldata,
        value,
      }

      setAttemptingTxn(true)

      library
        .getSigner()
        .estimateGas(txn)
        .then((estimate) => {
          const newTxn = {
            ...txn,
            gasLimit: calculateGasMargin(chainId, estimate),
          }
          return library
            .getSigner()
            .sendTransaction(newTxn)
            .then((response: TransactionResponse) => {
              setAttemptingTxn(false)
              addTransaction(response, {
                type: TransactionType.CREATE_V3_POOL,
                baseCurrencyId: currencyId(baseCurrency),
                quoteCurrencyId: currencyId(quoteCurrency),
              })
              // dont set txn hash as we dont want submitted txn screen for create
              ReactGA.event({
                category: 'Liquidity',
                action: 'Create',
                label: [currencies[Field.CURRENCY_A]?.symbol, currencies[Field.CURRENCY_B]?.symbol].join('/'),
              })
            })
        })
        .catch((error) => {
          console.error('Failed to send transaction', error)
          setAttemptingTxn(false)
          // we only care if the error is something _other_ than the user rejected the tx
          if (error?.code !== 4001) {
            console.error(error)
          }
        })
    } else {
      return
    }
  }

  async function onAdd() {
    if (!chainId || !library || !account) return

    if (!positionManager || !baseCurrency || !quoteCurrency) {
      return
    }

    if (position && account && deadline) {
      const useNative = baseCurrency.isNative ? baseCurrency : quoteCurrency.isNative ? quoteCurrency : undefined
      const { calldata, value } =
        hasExistingPosition && tokenId
          ? NonfungiblePositionManager.addCallParameters(position, {
              tokenId,
              slippageTolerance: allowedSlippage,
              deadline: deadline.toString(),
              useNative,
            })
          : NonfungiblePositionManager.addCallParameters(position, {
              slippageTolerance: allowedSlippage,
              recipient: account,
              deadline: deadline.toString(),
              useNative,
              createPool: noLiquidity,
            })

      let txn: { to: string; data: string; value: string } = {
        to: NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[chainId],
        data: calldata,
        value,
      }

      if (argentWalletContract) {
        const amountA = parsedAmounts[Field.CURRENCY_A]
        const amountB = parsedAmounts[Field.CURRENCY_B]
        const batch = [
          ...(amountA && amountA.currency.isToken
            ? [approveAmountCalldata(amountA, NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[chainId])]
            : []),
          ...(amountB && amountB.currency.isToken
            ? [approveAmountCalldata(amountB, NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[chainId])]
            : []),
          {
            to: txn.to,
            data: txn.data,
            value: txn.value,
          },
        ]
        const data = argentWalletContract.interface.encodeFunctionData('wc_multiCall', [batch])
        txn = {
          to: argentWalletContract.address,
          data,
          value: '0x0',
        }
      }

      setAttemptingTxn(true)

      library
        .getSigner()
        .estimateGas(txn)
        .then((estimate) => {
          const newTxn = {
            ...txn,
            gasLimit: calculateGasMargin(chainId, estimate),
          }

          return library
            .getSigner()
            .sendTransaction(newTxn)
            .then((response: TransactionResponse) => {
              setAttemptingTxn(false)
              addTransaction(response, {
                type: TransactionType.ADD_LIQUIDITY_V3_POOL,
                baseCurrencyId: currencyId(baseCurrency),
                quoteCurrencyId: currencyId(quoteCurrency),
                createPool: Boolean(noLiquidity),
                expectedAmountBaseRaw: parsedAmounts[Field.CURRENCY_A]?.quotient?.toString() ?? '0',
                expectedAmountQuoteRaw: parsedAmounts[Field.CURRENCY_B]?.quotient?.toString() ?? '0',
                feeAmount: position.pool.fee,
              })
              setTxHash(response.hash)
              ReactGA.event({
                category: 'Liquidity',
                action: 'Add',
                label: [currencies[Field.CURRENCY_A]?.symbol, currencies[Field.CURRENCY_B]?.symbol].join('/'),
              })
            })
        })
        .catch((error) => {
          console.error('Failed to send transaction', error)
          setAttemptingTxn(false)
          // we only care if the error is something _other_ than the user rejected the tx
          if (error?.code !== 4001) {
            console.error(error)
          }
        })
    } else {
      return
    }
  }

  const setPriceStrike = useCallback(
    (strike: number, range: number) => {
      const priceLower = strike / range
      const priceUpper = strike * range
      onLeftRangeInput(priceLower > priceUpper ? strike.toString() : priceLower.toString())
      onRightRangeInput(priceUpper < priceLower ? strike.toString() : priceUpper.toString())
    },
    [onLeftRangeInput, onRightRangeInput]
  )

  const setPriceRange = useCallback(
    (tickLower: number, tickUpper: number, invertPrice: boolean) => {
      const priceLower = invertPrice ? (1.0001 ** -tickUpper).toString() : (1.0001 ** tickLower).toString()
      const priceUpper = invertPrice ? (1.0001 ** -tickLower).toString() : (1.0001 ** tickUpper).toString()
      onLeftRangeInput(priceLower)
      onRightRangeInput(priceUpper)
    },
    [onLeftRangeInput, onRightRangeInput]
  )

  const handleCurrencySelect = useCallback(
    (currencyNew: Currency, currencyIdOther?: string): (string | undefined)[] => {
      const currencyIdNew = currencyId(currencyNew)

      if (currencyIdNew === currencyIdOther) {
        // not ideal, but for now clobber the other if the currency ids are equal
        return [currencyIdNew, undefined]
      } else {
        // prevent weth + eth
        const isETHOrWETHNew =
          currencyIdNew === 'ETH' || (chainId !== undefined && currencyIdNew === WETH9_EXTENDED[chainId]?.address)
        const isETHOrWETHOther =
          currencyIdOther !== undefined &&
          (currencyIdOther === 'ETH' || (chainId !== undefined && currencyIdOther === WETH9_EXTENDED[chainId]?.address))

        if (isETHOrWETHNew && isETHOrWETHOther) {
          return [currencyIdNew, undefined]
        } else {
          return [currencyIdNew, currencyIdOther]
        }
      }
    },
    [chainId]
  )

  const handleCurrencyASelect = useCallback(
    (currencyANew: Currency) => {
      const [idA, idB] = handleCurrencySelect(currencyANew, currencyIdB)
      if (idB === undefined) {
        history.push(`/add/${idA}`)
      } else {
        history.push(`/add/${idA}/${idB}`)
      }
    },
    [handleCurrencySelect, currencyIdB, history]
  )

  const handleCurrencyBSelect = useCallback(
    (currencyBNew: Currency) => {
      const [idB, idA] = handleCurrencySelect(currencyBNew, currencyIdA)
      if (idA === undefined) {
        history.push(`/add/${idB}`)
      } else {
        history.push(`/add/${idA}/${idB}`)
      }
    },
    [handleCurrencySelect, currencyIdA, history]
  )

  const handleFeePoolSelect = useCallback(
    (newFeeAmount: FeeAmount) => {
      onLeftRangeInput('')
      onRightRangeInput('')
      history.push(`/add/${currencyIdA}/${currencyIdB}/${newFeeAmount}`)
    },
    [currencyIdA, currencyIdB, history, onLeftRangeInput, onRightRangeInput]
  )

  // flag for whether pool creation must be a separate tx
  const mustCreateSeparately =
    noLiquidity && (chainId === SupportedChainId.OPTIMISM || chainId === SupportedChainId.OPTIMISTIC_KOVAN)

  const handleDismissConfirmation = useCallback(() => {
    setShowConfirm(false)
    // if there was a tx hash, we want to clear the input
    if (txHash) {
      onFieldAInput('')
      // dont jump to pool page if creating
      if (!mustCreateSeparately) {
        history.push('/pool')
      }
    }
    setTxHash('')
  }, [history, mustCreateSeparately, onFieldAInput, txHash])

  const addIsUnsupported = useIsSwapUnsupported(currencies?.CURRENCY_A, currencies?.CURRENCY_B)

  const clearAll = useCallback(() => {
    onFieldAInput('')
    onFieldBInput('')
    onLeftRangeInput('')
    onRightRangeInput('')
    history.push(`/add`)
  }, [history, onFieldAInput, onFieldBInput, onLeftRangeInput, onRightRangeInput])

  // get value and prices at ticks
  const { [Bound.LOWER]: tickLower, [Bound.UPPER]: tickUpper } = ticks
  const { [Bound.LOWER]: priceLower, [Bound.UPPER]: priceUpper } = pricesAtTicks

  const { getDecrementLower, getIncrementLower, getDecrementUpper, getIncrementUpper, getSetFullRange } =
    useRangeHopCallbacks(baseCurrency ?? undefined, quoteCurrency ?? undefined, feeAmount, tickLower, tickUpper, pool)

  const currentPrice = price ? parseFloat((invertPrice ? price.invert() : price).toSignificant(10)) : 1
  const cTick = price ? Number((Math.log(currentPrice) / Math.log(1.0001)).toFixed(0)) : 0
  const currentTick = invertPrice ? -cTick : cTick
  const upperPrice = priceUpper ? parseFloat((invertPrice ? priceUpper.invert() : priceUpper).toSignificant(10)) : 1
  const lowerPrice = priceLower ? parseFloat((invertPrice ? priceLower.invert() : priceLower).toSignificant(10)) : 1
  const strike = (upperPrice * lowerPrice) ** 0.5
  const r = upperPrice > lowerPrice ? (upperPrice / lowerPrice) ** 0.5 : (lowerPrice / upperPrice) ** 0.5
  const tickSpacing = feeAmount ? feeAmount / 50 : 10
  const dte = (((2 * 3.1416) / volatility ** 2) * (r ** 0.5 - 1) ** 2) / (r ** 0.5 + 1) ** 2
  const dte15 = (((2 * 3.1416) / volatility ** 2) * (1.15 ** 0.5 - 1) ** 2) / (1.15 ** 0.5 + 1) ** 2
  const delta =
    0.5 - 0.5 * erf((log(currentPrice / strike) + (dte / 2) * volatility ** 2) / (volatility * (2 * dte) ** 0.5))

  const Pc = price ? parseFloat((invertPrice ? price.invert() : price).toSignificant(10)) : 1
  const Pa = lowerPrice < upperPrice ? lowerPrice : upperPrice
  const Pb = upperPrice > lowerPrice ? upperPrice : lowerPrice
  const Pmax = Pc * 2
  const Pmin = Pc / 2
  const startPrice = currentPrice
  const inRange = Pa < Pc && Pc < Pb

  const dL =
    Pc > Pa && Pc < Pb
      ? 1 / (Pc ** 0.5 - Pa ** 0.5)
      : Pc < Pa
      ? 1 / (Pa ** -0.5 - Pb ** -0.5)
      : 1 / (Pb ** 0.5 - Pa ** 0.5)

  const dE =
    currentPrice < Pb
      ? (dL * (Pb ** 0.5 - startPrice ** 0.5)) / (Pb * startPrice) ** 0.5
      : (dL * (startPrice ** 0.5 - Pa ** 0.5)) / startPrice

  const baseValue =
    startPrice < Pb && startPrice > Pa
      ? (dE * (2 * (strike * startPrice * r) ** 0.5 - strike - startPrice)) / (r - 1)
      : startPrice <= Pa
      ? dE * startPrice
      : (dE * (2 * (strike * Pb * r) ** 0.5 - strike - Pb)) / (r - 1)

  const nPt = 192
  const dataPayoff: any[] = []
  for (let pt = 0; pt <= nPt; pt++) {
    const xx = ((Pmax * r - Pmin / r) * pt) / nPt + Pmin / r
    const yy =
      xx < Pa
        ? dE * xx - baseValue
        : xx >= Pa && xx < Pb
        ? (dE * (2 * (strike * xx * r) ** 0.5 - strike - xx)) / (r - 1) - baseValue
        : xx >= Pb
        ? dE * strike - baseValue
        : 0
    dataPayoff.push({ x: xx.toPrecision(5), y: yy.toPrecision(5) })
  }

  const minPnL = Math.min(...dataPayoff.map((i) => parseFloat(i.y)))
  const maxPnL = Math.max(...dataPayoff.map((i) => parseFloat(i.y)))

  const gradientOffset = () => {
    const dataMax = Math.max(...dataPayoff.map((i) => parseFloat(i.y)))
    const dataMin = Math.min(...dataPayoff.map((i) => parseFloat(i.y)))

    if (dataMax <= 0) {
      return 0
    }
    if (dataMin >= 0) {
      return 1
    }

    return dataMax / (dataMax - dataMin)
  }
  const off = gradientOffset()
  // we need an existence check on parsed amounts for single-asset deposits
  const showApprovalA =
    !argentWalletContract && approvalA !== ApprovalState.APPROVED && !!parsedAmounts[Field.CURRENCY_A]
  const showApprovalB =
    !argentWalletContract && approvalB !== ApprovalState.APPROVED && !!parsedAmounts[Field.CURRENCY_B]

  const pendingText = mustCreateSeparately
    ? `Creating ${currencies[Field.CURRENCY_A]?.symbol}/${currencies[Field.CURRENCY_B]?.symbol} ${
        feeAmount ? feeAmount / 10000 : ''
      }% Pool`
    : `Supplying ${!depositADisabled ? parsedAmounts[Field.CURRENCY_A]?.toSignificant(6) : ''} ${
        !depositADisabled ? currencies[Field.CURRENCY_A]?.symbol : ''
      } ${!outOfRange ? 'and' : ''} ${!depositBDisabled ? parsedAmounts[Field.CURRENCY_B]?.toSignificant(6) : ''} ${
        !depositBDisabled ? currencies[Field.CURRENCY_B]?.symbol : ''
      }`

  const Buttons = () =>
    addIsUnsupported ? (
      <ButtonPrimary disabled={true} $borderRadius="12px" padding={'12px'}>
        <TYPE.main mb="4px">
          <Trans>Unsupported Asset</Trans>
        </TYPE.main>
      </ButtonPrimary>
    ) : !account ? (
      <ButtonLight onClick={toggleWalletModal} $borderRadius="12px" padding={'12px'}>
        <Trans>Connect Wallet</Trans>
      </ButtonLight>
    ) : (
      <AutoColumn gap={'md'}>
        {(approvalA === ApprovalState.NOT_APPROVED ||
          approvalA === ApprovalState.PENDING ||
          approvalB === ApprovalState.NOT_APPROVED ||
          approvalB === ApprovalState.PENDING) &&
          isValid && (
            <RowBetween>
              {showApprovalA && (
                <ButtonPrimary
                  onClick={approveACallback}
                  disabled={approvalA === ApprovalState.PENDING}
                  width={showApprovalB ? '48%' : '100%'}
                >
                  {approvalA === ApprovalState.PENDING ? (
                    <Dots>
                      <Trans>Approving {currencies[Field.CURRENCY_A]?.symbol}</Trans>
                    </Dots>
                  ) : (
                    <Trans>Approve {currencies[Field.CURRENCY_A]?.symbol}</Trans>
                  )}
                </ButtonPrimary>
              )}
              {showApprovalB && (
                <ButtonPrimary
                  onClick={approveBCallback}
                  disabled={approvalB === ApprovalState.PENDING}
                  width={showApprovalA ? '48%' : '100%'}
                >
                  {approvalB === ApprovalState.PENDING ? (
                    <Dots>
                      <Trans>Approving {currencies[Field.CURRENCY_B]?.symbol}</Trans>
                    </Dots>
                  ) : (
                    <Trans>Approve {currencies[Field.CURRENCY_B]?.symbol}</Trans>
                  )}
                </ButtonPrimary>
              )}
            </RowBetween>
          )}
        {mustCreateSeparately && (
          <ButtonError onClick={onCreate} disabled={!isValid || attemptingTxn || !position}>
            {attemptingTxn ? (
              <Dots>
                <Trans>Confirm Create</Trans>
              </Dots>
            ) : (
              <Text fontWeight={500}>{errorMessage ? errorMessage : <Trans>Create</Trans>}</Text>
            )}
          </ButtonError>
        )}
        <ButtonError
          onClick={() => {
            expertMode ? onAdd() : setShowConfirm(true)
          }}
          disabled={
            mustCreateSeparately ||
            !isValid ||
            (!argentWalletContract && approvalA !== ApprovalState.APPROVED && !depositADisabled) ||
            (!argentWalletContract && approvalB !== ApprovalState.APPROVED && !depositBDisabled)
          }
          error={!isValid && !!parsedAmounts[Field.CURRENCY_A] && !!parsedAmounts[Field.CURRENCY_B]}
        >
          <Text fontWeight={500}>
            {mustCreateSeparately ? <Trans>Add</Trans> : errorMessage ? errorMessage : <Trans>Preview</Trans>}
          </Text>
        </ButtonError>
      </AutoColumn>
    )

  return (
    <>
      <ScrollablePage>
        <DowntimeWarning />
        <TransactionConfirmationModal
          isOpen={showConfirm}
          onDismiss={handleDismissConfirmation}
          attemptingTxn={attemptingTxn}
          hash={txHash}
          content={() => (
            <ConfirmationModalContent
              title={<Trans>Add Liquidity</Trans>}
              onDismiss={handleDismissConfirmation}
              topContent={() => (
                <Review
                  parsedAmounts={parsedAmounts}
                  position={position}
                  existingPosition={existingPosition}
                  priceLower={priceLower}
                  priceUpper={priceUpper}
                  outOfRange={outOfRange}
                  ticksAtLimit={ticksAtLimit}
                />
              )}
              bottomContent={() => (
                <ButtonPrimary style={{ marginTop: '1rem' }} onClick={onAdd}>
                  <Text fontWeight={500} fontSize={20}>
                    <Trans>Add</Trans>
                  </Text>
                </ButtonPrimary>
              )}
            />
          )}
          pendingText={pendingText}
        />
        <PageWrapper wide={true}>
          <AddRemoveTabs
            creating={false}
            adding={true}
            positionID={tokenId}
            defaultSlippage={DEFAULT_ADD_IN_RANGE_SLIPPAGE_TOLERANCE}
            showBackLink={!hasExistingPosition}
          >
            {!hasExistingPosition && (
              <Row justifyContent="flex-end" style={{ width: 'fit-content', minWidth: 'fit-content' }}>
                <MediumOnly>
                  <ButtonText onClick={clearAll} margin="0 15px 0 0">
                    <TYPE.blue fontSize="12px">
                      <Trans>Clear All</Trans>
                    </TYPE.blue>
                  </ButtonText>
                </MediumOnly>
                {baseCurrency && quoteCurrency ? (
                  <RateToggle
                    currencyA={baseCurrency}
                    currencyB={quoteCurrency}
                    handleRateToggle={() => {
                      if (!ticksAtLimit[Bound.LOWER] && !ticksAtLimit[Bound.UPPER]) {
                        onLeftRangeInput((invertPrice ? priceLower : priceUpper?.invert())?.toSignificant(6) ?? '')
                        onRightRangeInput((invertPrice ? priceUpper : priceLower?.invert())?.toSignificant(6) ?? '')
                        onFieldAInput(formattedAmounts[Field.CURRENCY_B] ?? '')
                      }
                      history.push(
                        `/add/${currencyIdB as string}/${currencyIdA as string}${feeAmount ? '/' + feeAmount : ''}`
                      )
                    }}
                  />
                ) : null}
              </Row>
            )}
          </AddRemoveTabs>
          {!hasExistingPosition ? (
            <Collapsible trigger="+ Click to Show Existing positions" triggerWhenOpen="">
              <RowBetween>
                <TYPE.label>
                  <Trans>Existing Positions:</Trans>
                </TYPE.label>
              </RowBetween>
              {positions.positions
                ? positions.positions.map((p) => {
                    return (
                      <RowBetween key={p.id}>
                        <ExternalLink href={'http://app.yewbow.org/#/pool/' + p.id}>Position {p.id}</ExternalLink>
                        <MediumOnly>
                          {baseCurrency && quoteCurrency && feeAmount ? (
                            <ButtonText
                              onClick={() => setPriceRange(p.tickLower.tickIdx, p.tickUpper.tickIdx, invertPrice)}
                            >
                              <Trans>Use same range</Trans>
                            </ButtonText>
                          ) : null}
                        </MediumOnly>
                        <MediumOnly>
                          {baseCurrency && quoteCurrency && feeAmount ? (
                            <ButtonText
                              as={Link}
                              to={`/increase/${currencyId(baseCurrency)}/${currencyId(quoteCurrency)}/${feeAmount}/${
                                p.id
                              }`}
                            >
                              <Trans>Add Liquidity to {p.id}</Trans>
                            </ButtonText>
                          ) : null}
                        </MediumOnly>
                      </RowBetween>
                    )
                  })
                : '0x'}
            </Collapsible>
          ) : null}
          <Wrapper>
            <ResponsiveTwoColumns wide={true}>
              <AutoColumn gap="lg">
                {!hasExistingPosition && (
                  <>
                    <AutoColumn gap="md">
                      <RowBetween paddingBottom="20px">
                        <TYPE.label>
                          <Trans>Select Pair</Trans>
                        </TYPE.label>
                      </RowBetween>
                      <RowBetween>
                        <CurrencyDropdown
                          value={formattedAmounts[Field.CURRENCY_A]}
                          onUserInput={onFieldAInput}
                          hideInput={true}
                          onMax={() => {
                            onFieldAInput(maxAmounts[Field.CURRENCY_A]?.toExact() ?? '')
                          }}
                          onCurrencySelect={handleCurrencyASelect}
                          showMaxButton={!atMaxAmounts[Field.CURRENCY_A]}
                          currency={currencies[Field.CURRENCY_A] ?? null}
                          id="add-liquidity-input-tokena"
                          showCommonBases
                        />

                        <div style={{ width: '12px' }} />

                        <CurrencyDropdown
                          value={formattedAmounts[Field.CURRENCY_B]}
                          hideInput={true}
                          onUserInput={onFieldBInput}
                          onCurrencySelect={handleCurrencyBSelect}
                          onMax={() => {
                            onFieldBInput(maxAmounts[Field.CURRENCY_B]?.toExact() ?? '')
                          }}
                          showMaxButton={!atMaxAmounts[Field.CURRENCY_B]}
                          currency={currencies[Field.CURRENCY_B] ?? null}
                          id="add-liquidity-input-tokenb"
                          showCommonBases
                        />
                      </RowBetween>

                      <FeeSelector
                        disabled={!quoteCurrency || !baseCurrency}
                        feeAmount={feeAmount}
                        handleFeePoolSelect={handleFeePoolSelect}
                        currencyA={baseCurrency ?? undefined}
                        currencyB={quoteCurrency ?? undefined}
                      />
                    </AutoColumn>{' '}
                    <>
                      <RowBetween paddingBottom="20px">
                        <TYPE.label>
                          <Trans>Select Strike</Trans>
                        </TYPE.label>
                      </RowBetween>
                      <RowBetween>
                        <MaxButton onClick={() => setPriceStrike(strike / 1.0001 ** (5 * tickSpacing), r)} width="20%">
                          ←←
                        </MaxButton>
                        <MaxButton onClick={() => setPriceStrike(strike / 1.0001 ** tickSpacing, r)} width="20%">
                          ←
                        </MaxButton>
                        <MaxButton onClick={() => setPriceStrike(Pc, r)} width="20%">
                          Current Price
                        </MaxButton>
                        <MaxButton onClick={() => setPriceStrike(strike * 1.0001 ** tickSpacing, r)} width="20%">
                          →
                        </MaxButton>
                        <MaxButton onClick={() => setPriceStrike(strike * 1.0001 ** (5 * tickSpacing), r)} width="20%">
                          →→
                        </MaxButton>
                      </RowBetween>
                      <RowBetween paddingBottom="20px">
                        <TYPE.label>
                          <Trans>Select Width</Trans>
                        </TYPE.label>
                      </RowBetween>
                      <RowBetween>
                        <MaxButton onClick={() => setPriceStrike(strike, r / 1.0001 ** (10 * tickSpacing))} width="20%">
                          →→ ←←
                        </MaxButton>
                        <MaxButton onClick={() => setPriceStrike(strike, r / 1.0001 ** tickSpacing)} width="20%">
                          → ←
                        </MaxButton>
                        <MaxButton onClick={() => setPriceStrike(strike, 1.15)} width="20%">
                          ±15%
                          <br />({dte15 > 1 ? (dte < 100000 ? dte15.toFixed(0) : '-') : '<1'} dte)
                        </MaxButton>
                        <MaxButton onClick={() => setPriceStrike(strike, r * 1.0001 ** tickSpacing)} width="20%">
                          ← →
                        </MaxButton>
                        <MaxButton onClick={() => setPriceStrike(strike, r * 1.0001 ** (10 * tickSpacing))} width="20%">
                          ←← →→
                        </MaxButton>
                      </RowBetween>
                      <RowBetween paddingBottom="20px">
                        <TYPE.label>
                          <Trans>PnL Graph</Trans>
                        </TYPE.label>
                      </RowBetween>
                      <RowBetween paddingBottom="20px">
                        <ComposedChart
                          width={500}
                          height={300}
                          margin={{ top: 20, left: 20, right: 20, bottom: 50 }}
                          data={dataPayoff}
                        >
                          <defs>
                            <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                              <stop offset={off} stopColor="green" stopOpacity={1} />
                              <stop offset={off} stopColor="red" stopOpacity={1} />
                            </linearGradient>
                          </defs>
                          <Area
                            type="basis"
                            isAnimationActive={false}
                            dataKey="y"
                            stroke="#000"
                            fill="url(#splitColor)"
                            activeDot={false}
                          />
                          <Tooltip
                            allowEscapeViewBox={{
                              x: true,
                              y: true,
                            }}
                            position={{ x: 238, y: 225 }}
                            coordinate={{ x: -100, y: 10 }}
                            cursor={{ stroke: 'red', strokeWidth: 1 }}
                          />
                          <ReferenceLine x={Pc} stroke="#231f20" />
                          <ReferenceLine x={strike} stroke="#231f20" strokeDasharray="2 3" />
                          <ReferenceLine x={Pa} stroke="#000" strokeDasharray="3 5" />
                          <ReferenceLine x={Pb} stroke="#000" strokeDasharray="3 5" />
                          <ReferenceLine y={0} stroke="#000" />
                          <ReferenceArea
                            x1={Pa}
                            x2={Pb}
                            y1={minPnL}
                            y2={-minPnL * 0.25}
                            fillOpacity={0.075}
                            fill={inRange ? '#47b247' : '#cc333f'}
                          />
                          <XAxis
                            dataKey="x"
                            name="Price"
                            textAnchor="end"
                            interval={0}
                            allowDataOverflow={true}
                            allowDuplicatedCategory={false}
                            angle={-45}
                            tick={{ fontSize: 10 }}
                            ticks={[Pa.toPrecision(5), Pc.toPrecision(5), Pb.toPrecision(5)]}
                            domain={[Pc / 2, Pc * 2]}
                            type="number"
                            label={{ value: 'Price', position: 'insideBottomRight', offset: 0 }}
                          />
                          <YAxis
                            tick={{ fontSize: 10 }}
                            allowDecimals={false}
                            interval={0}
                            allowDataOverflow={true}
                            dataKey="y"
                            ticks={[0, Math.max(...dataPayoff)]}
                            domain={[minPnL, -minPnL * 0.25]}
                            label={{ value: 'Profit/Loss', angle: -90, position: 'insideLeft', offset: 5 }}
                          />
                        </ComposedChart>
                      </RowBetween>
                    </>
                  </>
                )}
                {hasExistingPosition && existingPosition && (
                  <PositionPreview
                    position={existingPosition}
                    title={<Trans>Selected Range</Trans>}
                    inRange={!outOfRange}
                    ticksAtLimit={ticksAtLimit}
                  />
                )}
              </AutoColumn>
              {!hasExistingPosition ? (
                <>
                  <HideMedium>
                    <Buttons />
                  </HideMedium>
                  <RightContainer gap="lg">
                    <DynamicSection gap="md" disabled={!feeAmount || invalidPool}>
                      {!noLiquidity ? (
                        <>
                          <RowBetween>
                            <TYPE.label>
                              <Trans>Set Price Range</Trans>
                            </TYPE.label>
                          </RowBetween>

                          {price && baseCurrency && quoteCurrency && !noLiquidity && (
                            <AutoRow gap="4px" justify="center" style={{ marginTop: '0.5rem' }}>
                              <Trans>
                                <TYPE.main fontWeight={500} textAlign="center" fontSize={12} color="text1">
                                  Current Price:
                                </TYPE.main>
                                <TYPE.body fontWeight={500} textAlign="center" fontSize={12} color="text1">
                                  <HoverInlineText
                                    maxCharacters={20}
                                    text={invertPrice ? price.invert().toSignificant(6) : price.toSignificant(6)}
                                  />
                                </TYPE.body>
                                <TYPE.body color="text2" fontSize={12}>
                                  {quoteCurrency?.symbol} per {baseCurrency.symbol}
                                </TYPE.body>
                                <TYPE.main fontWeight={500} textAlign="center" fontSize={12} color="text1">
                                  Volatility: {(100 * volatility * 365 ** 0.5).toFixed(0)}%
                                </TYPE.main>
                                <TYPE.main fontWeight={500} textAlign="center" fontSize={12} color="text1">
                                  Effective days to expiration: {dte > 1 ? dte.toFixed(0) : '<1'}d
                                </TYPE.main>
                                <TYPE.main fontWeight={500} textAlign="center" fontSize={12} color="text1">
                                  Effective strike delta: {(delta * 100).toFixed(0)}
                                </TYPE.main>
                              </Trans>
                            </AutoRow>
                          )}

                          <LiquidityChartRangeInput
                            currencyA={baseCurrency ?? undefined}
                            currencyB={quoteCurrency ?? undefined}
                            feeAmount={feeAmount}
                            ticksAtLimit={ticksAtLimit}
                            price={
                              price ? parseFloat((invertPrice ? price.invert() : price).toSignificant(8)) : undefined
                            }
                            priceLower={priceLower}
                            priceUpper={priceUpper}
                            onLeftRangeInput={onLeftRangeInput}
                            onRightRangeInput={onRightRangeInput}
                            interactive={!hasExistingPosition ? true : false}
                          />
                        </>
                      ) : (
                        <AutoColumn gap="md">
                          <RowBetween>
                            <TYPE.label>
                              <Trans>Set Starting Price</Trans>
                            </TYPE.label>
                          </RowBetween>
                          {noLiquidity && (
                            <BlueCard
                              style={{
                                display: 'flex',
                                flexDirection: 'row',
                                alignItems: 'center',
                                padding: '1rem 1rem',
                              }}
                            >
                              <TYPE.body
                                fontSize={14}
                                style={{ fontWeight: 500 }}
                                textAlign="left"
                                color={theme.primaryText1}
                              >
                                {mustCreateSeparately ? (
                                  <Trans>
                                    {`This pool must be initialized on ${
                                      chainId && CHAIN_INFO ? CHAIN_INFO[chainId].label : ''
                                    } before you can add liquidity. To initialize, select a starting price for the pool. Then, enter your liquidity price range and deposit amount.`}
                                  </Trans>
                                ) : (
                                  <Trans>
                                    This pool must be initialized before you can add liquidity. To initialize, select a
                                    starting price for the pool. Then, enter your liquidity price range and deposit
                                    amount. Gas fees will be higher than usual due to the initialization transaction.
                                  </Trans>
                                )}
                              </TYPE.body>
                            </BlueCard>
                          )}
                          <OutlineCard padding="12px">
                            <StyledInput
                              className="start-price-input"
                              value={startPriceTypedValue}
                              onUserInput={onStartPriceInput}
                            />
                          </OutlineCard>
                          <RowBetween style={{ backgroundColor: theme.bg1, padding: '12px', borderRadius: '12px' }}>
                            <TYPE.main>
                              <Trans>Current {baseCurrency?.symbol} Price:</Trans>
                            </TYPE.main>
                            <TYPE.main>
                              {price ? (
                                <TYPE.main>
                                  <RowFixed>
                                    <HoverInlineText
                                      maxCharacters={20}
                                      text={invertPrice ? price?.invert()?.toSignificant(5) : price?.toSignificant(5)}
                                    />{' '}
                                    <span style={{ marginLeft: '4px' }}>{quoteCurrency?.symbol}</span>
                                  </RowFixed>
                                </TYPE.main>
                              ) : (
                                '-'
                              )}
                            </TYPE.main>
                          </RowBetween>
                        </AutoColumn>
                      )}
                    </DynamicSection>

                    <DynamicSection
                      gap="md"
                      disabled={!feeAmount || invalidPool || (noLiquidity && !startPriceTypedValue)}
                    >
                      <StackedContainer>
                        <StackedItem style={{ opacity: showCapitalEfficiencyWarning ? '0.05' : 1 }}>
                          <AutoColumn gap="md">
                            {noLiquidity && (
                              <RowBetween>
                                <TYPE.label>
                                  <Trans>Set Price Range</Trans>
                                </TYPE.label>
                              </RowBetween>
                            )}
                            <RangeSelector
                              priceLower={priceLower}
                              priceUpper={priceUpper}
                              getDecrementLower={getDecrementLower}
                              getIncrementLower={getIncrementLower}
                              getDecrementUpper={getDecrementUpper}
                              getIncrementUpper={getIncrementUpper}
                              onLeftRangeInput={onLeftRangeInput}
                              onRightRangeInput={onRightRangeInput}
                              currencyA={baseCurrency}
                              currencyB={quoteCurrency}
                              feeAmount={feeAmount}
                              ticksAtLimit={ticksAtLimit}
                            />
                            <ComposedChart
                              width={800}
                              height={200}
                              margin={{ top: 20, left: 40, right: 20, bottom: 30 }}
                              data={dayData1}
                            >
                              <XAxis
                                dataKey="date"
                                ticks={[startDate - (startDate % 86400)]}
                                reversed={true}
                                allowDataOverflow={true}
                              />
                              <YAxis
                                dataKey="price"
                                domain={[minPrice / 1.5, maxPrice * 1.5]}
                                tick={{ fontSize: 10 }}
                                ticks={[Pa.toPrecision(3), Pc.toPrecision(3), Pb.toPrecision(3)]}
                              />
                              <ReferenceArea y1={Pb} y2={Pa} fillOpacity={0.075} fill={'#47b247'} />
                              <ReferenceLine y={Pc} stroke="#000" strokeDasharray="2 3" />
                              <ReferenceLine y={lowerPrice} stroke="#000" strokeDasharray="3 5" />
                              <ReferenceLine y={upperPrice} stroke="#000" strokeDasharray="3 5" />
                              <Line data={dayData1} dataKey="price" dot={false} color="#56B2A4" />
                              <Tooltip labelFormatter={(t) => new Date(t * 1000).toLocaleDateString('en-CA')} />
                            </ComposedChart>
                          </AutoColumn>
                        </StackedItem>
                      </StackedContainer>

                      {outOfRange ? (
                        <YellowCard padding="8px 12px" $borderRadius="12px">
                          <RowBetween>
                            <AlertTriangle stroke={theme.yellow3} size="16px" />
                            <TYPE.yellow ml="12px" fontSize="12px">
                              <Trans>
                                Your position will not earn fees or be used in trades until the market price moves into
                                your range.
                              </Trans>
                            </TYPE.yellow>
                          </RowBetween>
                        </YellowCard>
                      ) : null}

                      {invalidRange ? (
                        <YellowCard padding="8px 12px" $borderRadius="12px">
                          <RowBetween>
                            <AlertTriangle stroke={theme.yellow3} size="16px" />
                            <TYPE.yellow ml="12px" fontSize="12px">
                              <Trans>Invalid range selected. The min price must be lower than the max price.</Trans>
                            </TYPE.yellow>
                          </RowBetween>
                        </YellowCard>
                      ) : null}
                    </DynamicSection>
                  </RightContainer>
                </>
              ) : (
                <Buttons />
              )}
            </ResponsiveTwoColumns>
            <DynamicSection
              gap="md"
              disabled={tickLower === undefined || tickUpper === undefined || invalidPool || invalidRange}
            >
              <AutoColumn gap={'md'}>
                <TYPE.label>
                  {hasExistingPosition ? <Trans>Add more liquidity</Trans> : <Trans>Deposit Amounts</Trans>}
                </TYPE.label>

                <CurrencyInputPanel
                  value={formattedAmounts[Field.CURRENCY_A]}
                  onUserInput={onFieldAInput}
                  onMax={() => {
                    onFieldAInput(maxAmounts[Field.CURRENCY_A]?.toExact() ?? '')
                  }}
                  showMaxButton={!atMaxAmounts[Field.CURRENCY_A]}
                  currency={currencies[Field.CURRENCY_A] ?? null}
                  id="add-liquidity-input-tokena"
                  fiatValue={usdcValues[Field.CURRENCY_A]}
                  showCommonBases
                  locked={depositADisabled}
                />
              </AutoColumn>
              <AutoColumn gap={'md'}>
                <CurrencyInputPanel
                  value={formattedAmounts[Field.CURRENCY_B]}
                  onUserInput={onFieldBInput}
                  onMax={() => {
                    onFieldBInput(maxAmounts[Field.CURRENCY_B]?.toExact() ?? '')
                  }}
                  showMaxButton={!atMaxAmounts[Field.CURRENCY_B]}
                  fiatValue={usdcValues[Field.CURRENCY_B]}
                  currency={currencies[Field.CURRENCY_B] ?? null}
                  id="add-liquidity-input-tokenb"
                  showCommonBases
                  locked={depositBDisabled}
                />
              </AutoColumn>
            </DynamicSection>
            <br />
            <MediumOnly>
              <Buttons />
            </MediumOnly>
          </Wrapper>
        </PageWrapper>
        {addIsUnsupported && (
          <UnsupportedCurrencyFooter
            show={addIsUnsupported}
            currencies={[currencies.CURRENCY_A, currencies.CURRENCY_B]}
          />
        )}
      </ScrollablePage>
      <SwitchLocaleLink />
    </>
  )
}
