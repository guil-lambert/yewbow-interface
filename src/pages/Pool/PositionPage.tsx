import { BigNumber } from '@ethersproject/bignumber'
import { TransactionResponse } from '@ethersproject/providers'
import { Trans } from '@lingui/macro'
import { Currency, CurrencyAmount, Fraction, Percent, Price, Token } from '@uniswap/sdk-core'
import { computePoolAddress, NonfungiblePositionManager, Pool, Position } from '@uniswap/v3-sdk'
import Badge from 'components/Badge'
import { ButtonConfirmed, ButtonGray, ButtonPrimary } from 'components/Button'
import { DarkCard, LightCard } from 'components/Card'
import { AutoColumn } from 'components/Column'
import CurrencyLogo from 'components/CurrencyLogo'
import DoubleCurrencyLogo from 'components/DoubleLogo'
import Loader from 'components/Loader'
import { RowBetween, RowFixed } from 'components/Row'
import { Dots } from 'components/swap/styleds'
import Toggle from 'components/Toggle'
import TransactionConfirmationModal, { ConfirmationModalContent } from 'components/TransactionConfirmationModal'
import { SupportedChainId } from 'constants/chains'
import { erf } from 'extra-math'
import { useToken } from 'hooks/Tokens'
import { useV3NFTPositionManagerContract } from 'hooks/useContract'
import useIsTickAtLimit from 'hooks/useIsTickAtLimit'
import { PoolState, usePool } from 'hooks/usePools'
import useUSDCPrice from 'hooks/useUSDCPrice'
import { useV3PositionFees } from 'hooks/useV3PositionFees'
import { useAllPositions, useV3PositionFromTokenId } from 'hooks/useV3Positions'
import { useActiveWeb3React } from 'hooks/web3'
import JSBI from 'jsbi'
import { useCallback, useMemo, useState } from 'react'
import ReactGA from 'react-ga'
import { Link, RouteComponentProps } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { Bound } from 'state/mint/v3/actions'
import { useSingleCallResult } from 'state/multicall/hooks'
import { useIsTransactionPending, useTransactionAdder } from 'state/transactions/hooks'
import styled from 'styled-components/macro'
import { ExternalLink, HideExtraSmall, TYPE } from 'theme'
import { currencyId } from 'utils/currencyId'
import { formatCurrencyAmount } from 'utils/formatCurrencyAmount'
import { formatTickPrice } from 'utils/formatTickPrice'
import { unwrappedToken } from 'utils/unwrappedToken'

import RangeBadge from '../../components/Badge/RangeBadge'
import { getPriceOrderingFromPositionForUI } from '../../components/PositionListItem'
import RateToggle from '../../components/RateToggle'
import { SwitchLocaleLink } from '../../components/SwitchLocaleLink'
import { V3_CORE_FACTORY_ADDRESSES } from '../../constants/addresses'
import { WETH9_EXTENDED } from '../../constants/tokens'
import { usePositionTokenURI } from '../../hooks/usePositionTokenURI'
import useTheme from '../../hooks/useTheme'
import { TransactionType } from '../../state/transactions/actions'
import { calculateGasMargin } from '../../utils/calculateGasMargin'
import { ExplorerDataType, getExplorerLink } from '../../utils/getExplorerLink'
import { LoadingRows } from './styleds'

const PageWrapper = styled.div`
  min-width: 800px;
  max-width: 1920px;

  ${({ theme }) => theme.mediaWidth.upToMedium`
    min-width: 680px;
    max-width: 680px;
  `};

  ${({ theme }) => theme.mediaWidth.upToSmall`
    min-width: 600px;
    max-width: 600px;
  `};

  @media only screen and (max-width: 620px) {
    min-width: 500px;
    max-width: 500px;
  }

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    min-width: 340px;
    max-width: 340px;
  `};
`

const BadgeText = styled.div`
  font-weight: 500;
  font-size: 14px;
`

// responsive text
// disable the warning because we don't use the end prop, we just want to filter it out
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Label = styled(({ end, ...props }) => <TYPE.label {...props} />)<{ end?: boolean }>`
  display: flex;
  font-size: 16px;
  justify-content: ${({ end }) => (end ? 'flex-end' : 'flex-start')};
  align-items: center;
`

const ExtentsText = styled.span`
  color: ${({ theme }) => theme.text2};
  font-size: 14px;
  text-align: center;
  margin-right: 4px;
  font-weight: 500;
`

const HoverText = styled(TYPE.main)`
  text-decoration: none;
  color: ${({ theme }) => theme.text3};
  :hover {
    color: ${({ theme }) => theme.text1};
    text-decoration: none;
  }
`

const DoubleArrow = styled.span`
  color: ${({ theme }) => theme.text3};
  margin: 0 1rem;
`
const ResponsiveRow = styled(RowBetween)`
  ${({ theme }) => theme.mediaWidth.upToSmall`
    flex-direction: column;
    align-items: flex-start;
    row-gap: 16px;
    width: 100%:
  `};
`

const ResponsiveButtonPrimary = styled(ButtonPrimary)`
  border-radius: 4px;
  padding: 6px 8px;
  width: fit-content;
  ${({ theme }) => theme.mediaWidth.upToSmall`
    flex: 1 1 auto;
    width: 49%;
  `};
`

function CurrentPriceCard({
  inverted,
  pool,
  currencyQuote,
  currencyBase,
  r,
  strike,
  owner,
  poolAddress,
  chainId,
}: {
  inverted?: boolean
  pool?: Pool | null
  currencyQuote?: Currency
  currencyBase?: Currency
  r?: number
  strike?: number
  owner?: null
  poolAddress?: string
  chainId?: number
}) {
  if (!pool || !currencyQuote || !currencyBase || !r || !owner || !poolAddress || !chainId || !strike) {
    return null
  }

  return (
    <LightCard padding="12px ">
      <ResponsiveRow>
        <RowFixed>
          <AutoColumn gap="8px" justify="start">
            <ExtentsText>
              <TYPE.mediumHeader textAlign="center">Pool Info/Links</TYPE.mediumHeader>
            </ExtentsText>
            <ExtentsText>
              <ExternalLink href={getExplorerLink(chainId, owner, ExplorerDataType.ADDRESS)}>
                <Trans>Owner</Trans>
              </ExternalLink>
            </ExtentsText>
            <ExtentsText>
              <ExternalLink href={getExplorerLink(chainId, poolAddress, ExplorerDataType.ADDRESS)}>
                <Trans>Pool address</Trans>
              </ExternalLink>
            </ExtentsText>
            <ExtentsText>
              <ExternalLink href={'http://info.yewbow.org/#/pools/' + poolAddress}>
                <Trans>Pool info</Trans>
              </ExternalLink>
            </ExtentsText>
          </AutoColumn>
        </RowFixed>
        <RowFixed>
          <AutoColumn gap="8px" justify="center">
            <ExtentsText>
              <Trans>Current price</Trans>
            </ExtentsText>
            <TYPE.mediumHeader textAlign="center">
              {(inverted ? pool.token1Price : pool.token0Price).toSignificant(6)}{' '}
            </TYPE.mediumHeader>
            <ExtentsText>
              <Trans>
                {currencyQuote?.symbol} per {currencyBase?.symbol}
              </Trans>
            </ExtentsText>
          </AutoColumn>
        </RowFixed>
        <RowFixed>
          <AutoColumn gap="8px" justify="end">
            <ExtentsText>
              <TYPE.mediumHeader textAlign="center">Position stats</TYPE.mediumHeader>
            </ExtentsText>
            <ExtentsText>
              <TYPE.small textAlign="center">
                <b>Strike:</b> {strike.toPrecision(5)} / {(1 / strike).toPrecision(5)}
              </TYPE.small>
            </ExtentsText>
            <ExtentsText>
              <TYPE.small textAlign="center">
                <b>Range factor:</b> {r.toPrecision(5)}
              </TYPE.small>
            </ExtentsText>
            <ExtentsText>
              <TYPE.small textAlign="center">
                <b>Capital Efficiency:</b> {(r ** 0.5 / (r ** 0.5 - 1)).toFixed(0)}X vs V2
              </TYPE.small>
            </ExtentsText>
          </AutoColumn>
        </RowFixed>
      </ResponsiveRow>
    </LightCard>
  )
}

function LinkedCurrency({ chainId, currency }: { chainId?: number; currency?: Currency }) {
  const address = (currency as Token)?.address

  if (typeof chainId === 'number' && address) {
    return (
      <ExternalLink href={getExplorerLink(chainId, address, ExplorerDataType.TOKEN)}>
        <RowFixed>
          <CurrencyLogo currency={currency} size={'20px'} style={{ marginRight: '0.5rem' }} />
          <TYPE.main>{currency?.symbol} ↗</TYPE.main>
        </RowFixed>
      </ExternalLink>
    )
  }

  return (
    <RowFixed>
      <CurrencyLogo currency={currency} size={'20px'} style={{ marginRight: '0.5rem' }} />
      <TYPE.main>{currency?.symbol}</TYPE.main>
    </RowFixed>
  )
}

function getRatio(
  lower: Price<Currency, Currency>,
  current: Price<Currency, Currency>,
  upper: Price<Currency, Currency>
) {
  try {
    if (!current.greaterThan(lower)) {
      return 100
    } else if (!current.lessThan(upper)) {
      return 0
    }

    const a = Number.parseFloat(lower.toSignificant(15))
    const b = Number.parseFloat(upper.toSignificant(15))
    const c = Number.parseFloat(current.toSignificant(15))

    const ratio = Math.floor((1 / ((Math.sqrt(a * b) - Math.sqrt(b * c)) / (c - Math.sqrt(b * c)) + 1)) * 100)

    if (ratio < 0 || ratio > 100) {
      throw Error('Out of range')
    }

    return ratio
  } catch {
    return undefined
  }
}

const useInverter = ({
  priceLower,
  priceUpper,
  quote,
  base,
  invert,
}: {
  priceLower?: Price<Token, Token>
  priceUpper?: Price<Token, Token>
  quote?: Token
  base?: Token
  invert?: boolean
}): {
  priceLower?: Price<Token, Token>
  priceUpper?: Price<Token, Token>
  quote?: Token
  base?: Token
} => {
  return {
    priceUpper: invert ? priceLower?.invert() : priceUpper,
    priceLower: invert ? priceUpper?.invert() : priceLower,
    quote: invert ? base : quote,
    base: invert ? quote : base,
  }
}

export function PositionPage({
  match: {
    params: { tokenId: tokenIdFromUrl },
  },
}: RouteComponentProps<{ tokenId?: string }>) {
  const { chainId, account, library } = useActiveWeb3React()
  const theme = useTheme()
  const parsedTokenId = tokenIdFromUrl ? BigNumber.from(tokenIdFromUrl) : undefined
  const { loading, position: positionDetails } = useV3PositionFromTokenId(parsedTokenId)
  const {
    token0: token0Address,
    token1: token1Address,
    fee: feeAmount,
    liquidity,
    tickLower,
    tickUpper,
    tokenId,
    tokensOwed0,
    tokensOwed1,
  } = positionDetails || {}
  const addTransaction = useTransactionAdder()
  const positionManager = useV3NFTPositionManagerContract()

  const owner = useSingleCallResult(!!tokenId ? positionManager : null, 'ownerOf', [tokenId]).result?.[0]

  const positions = useAllPositions(owner ? owner.toString() : 1)

  const removed = liquidity?.eq(0)

  const token0 = useToken(token0Address)
  const token1 = useToken(token1Address)

  const metadata = usePositionTokenURI(parsedTokenId)

  const currency0 = token0 ? unwrappedToken(token0) : undefined
  const currency1 = token1 ? unwrappedToken(token1) : undefined

  // flag for starting value
  const [midpointStart, setMidpointStart] = useState(false)

  // flag for receiving WETH
  const [receiveWETH, setReceiveWETH] = useState(false)

  // construct Position from details returned
  const [poolState, pool] = usePool(token0 ?? undefined, token1 ?? undefined, feeAmount)
  const position = useMemo(() => {
    if (pool && liquidity && typeof tickLower === 'number' && typeof tickUpper === 'number') {
      return new Position({ pool, liquidity: liquidity.toString(), tickLower, tickUpper })
    }
    return undefined
  }, [liquidity, pool, tickLower, tickUpper])

  const tickAtLimit = useIsTickAtLimit(feeAmount, tickLower, tickUpper)
  const v3CoreFactoryAddress = chainId && V3_CORE_FACTORY_ADDRESSES[chainId]

  const pricesFromPosition = getPriceOrderingFromPositionForUI(position)
  const [manuallyInverted, setManuallyInverted] = useState(true)

  // handle manual inversion
  const { priceLower, priceUpper, base } = useInverter({
    priceLower: pricesFromPosition.priceLower,
    priceUpper: pricesFromPosition.priceUpper,
    quote: pricesFromPosition.quote,
    base: pricesFromPosition.base,
    invert: manuallyInverted,
  })

  const inverted = token1 ? base?.equals(token1) : undefined
  const currencyQuote = inverted ? currency0 : currency1
  const currencyBase = inverted ? currency1 : currency0

  const ratio = useMemo(() => {
    return priceLower && pool && priceUpper
      ? getRatio(
          inverted ? priceUpper.invert() : priceLower,
          pool.token0Price,
          inverted ? priceLower.invert() : priceUpper
        )
      : undefined
  }, [inverted, pool, priceLower, priceUpper])

  // fees
  const [feeValue0, feeValue1] = useV3PositionFees(pool ?? undefined, positionDetails?.tokenId, receiveWETH)

  const [collecting, setCollecting] = useState<boolean>(false)
  const [collectMigrationHash, setCollectMigrationHash] = useState<string | null>(null)
  const isCollectPending = useIsTransactionPending(collectMigrationHash ?? undefined)
  const [showConfirm, setShowConfirm] = useState(false)

  // usdc prices always in terms of tokens
  const price0 = useUSDCPrice(token0 ?? undefined)
  const price1 = useUSDCPrice(token1 ?? undefined)

  const fiatValueOfFees: CurrencyAmount<Currency> | null = useMemo(() => {
    if (!price0 || !price1 || !feeValue0 || !feeValue1) return null

    // we wrap because it doesn't matter, the quote returns a USDC amount
    const feeValue0Wrapped = feeValue0?.wrapped
    const feeValue1Wrapped = feeValue1?.wrapped

    if (!feeValue0Wrapped || !feeValue1Wrapped) return null

    const amount0 = price0.quote(feeValue0Wrapped)
    const amount1 = price1.quote(feeValue1Wrapped)
    return amount0.add(amount1)
  }, [price0, price1, feeValue0, feeValue1])

  const fiatValueOfLiquidity: CurrencyAmount<Token> | null = useMemo(() => {
    if (!price0 || !price1 || !position) return null
    const amount0 = price0.quote(position.amount0)
    const amount1 = price1.quote(position.amount1)
    return amount0.add(amount1)
  }, [price0, price1, position])

  const collect = useCallback(() => {
    if (!chainId || !feeValue0 || !feeValue1 || !positionManager || !account || !tokenId || !library) return

    setCollecting(true)

    const { calldata, value } = NonfungiblePositionManager.collectCallParameters({
      tokenId: tokenId.toString(),
      expectedCurrencyOwed0: feeValue0,
      expectedCurrencyOwed1: feeValue1,
      recipient: account,
    })

    const txn = {
      to: positionManager.address,
      data: calldata,
      value,
    }

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
            setCollectMigrationHash(response.hash)
            setCollecting(false)

            ReactGA.event({
              category: 'Liquidity',
              action: 'CollectV3',
              label: [feeValue0.currency.symbol, feeValue1.currency.symbol].join('/'),
            })

            addTransaction(response, {
              type: TransactionType.COLLECT_FEES,
              currencyId0: currencyId(feeValue0.currency),
              currencyId1: currencyId(feeValue1.currency),
            })
          })
      })
      .catch((error) => {
        setCollecting(false)
        console.error(error)
      })
  }, [chainId, feeValue0, feeValue1, positionManager, account, tokenId, addTransaction, library])
  const ETHprice = useUSDCPrice(WETH9_EXTENDED[1] ?? undefined)

  //const owner = useSingleCallResult(!!tokenId ? positionManager : null, 'ownerOf', [tokenId]).result?.[0]
  const ownsNFT = owner === account || positionDetails?.operator === account
  const poolAddress =
    currency0 && currency1 && feeAmount ? Pool.getAddress(currency0?.wrapped, currency1?.wrapped, feeAmount) : ' '

  const p0 = tokenId && positions.positions ? positions.positions.filter((obj) => obj.id == tokenId.toString()) : 0
  const currentPosition =
    tokenId && positions.positions ? positions.positions.filter((obj) => obj.id == tokenId.toString()) : 0
  //const positionId2 = positions.positions ? positions.positions.findIndex((id) => parseInt(id) === 172886) : -1
  const depositedToken0 = currentPosition ? currentPosition[0].depositedToken0 : 1
  const depositedToken1 = currentPosition ? currentPosition[0].depositedToken1 : 1
  const collectedFeesToken0 = currentPosition ? currentPosition[0].collectedFeesToken0 : 1
  const collectedFeesToken1 = currentPosition ? currentPosition[0].collectedFeesToken1 : 1
  const positionLiquidity = currentPosition ? currentPosition[0].liquidity : 1
  const feeGrowthInside0LastX128 = currentPosition ? currentPosition[0].feeGrowthInside0LastX128 : 1
  const feeGrowthInside1LastX128 = currentPosition ? currentPosition[0].feeGrowthInside1LastX128 : 1
  const b256 = BigNumber.from('115792089237316195423570985008687907853269984665640564039457584007913129639936')
  const b128 = BigNumber.from('340282366920938463463374607431768211456')
  const feeGrowthLast0 = b256.sub(BigNumber.from(feeGrowthInside0LastX128))
  const feeGrowthLast1 = b256.sub(BigNumber.from(feeGrowthInside1LastX128))
  const feeGrowthGlobal0X128 = currentPosition ? currentPosition[0].pool.feeGrowthGlobal0X128 : 1
  const feeGrowthGlobal1X128 = currentPosition ? currentPosition[0].pool.feeGrowthGlobal1X128 : 1
  const feeLowerOutside0X128 = currentPosition ? currentPosition[0].tickLower.feeGrowthOutside0X128 : 1
  const feeLowerOutside1X128 = currentPosition ? currentPosition[0].tickLower.feeGrowthOutside1X128 : 1
  const feeUpperOutside0X128 = currentPosition ? currentPosition[0].tickUpper.feeGrowthOutside0X128 : 1
  const feeUpperOutside1X128 = currentPosition ? currentPosition[0].tickUpper.feeGrowthOutside1X128 : 1
  //const dep0 = positions.positions.find((id) => id == parseInt(tokenId)).depositedToken0
  const dec0 = pool ? pool.token0.decimals : 18
  const dec1 = pool ? pool.token1.decimals : 18
  const feeValueUpper = inverted ? feeValue0 : feeValue1
  const feeValueLower = inverted ? feeValue1 : feeValue0
  // check if price is within range
  const below =
    pool && typeof tickLower === 'number' && typeof tickUpper === 'number'
      ? inverted
        ? pool.tickCurrent < tickLower
        : pool.tickCurrent > tickUpper
      : undefined
  const above =
    pool && typeof tickLower === 'number' && typeof tickUpper === 'number'
      ? inverted
        ? pool.tickCurrent > tickUpper
        : pool.tickCurrent < tickLower
      : undefined
  const inRange: boolean = typeof below === 'boolean' && typeof above === 'boolean' ? !below && !above : false

  const fees = fiatValueOfFees ? parseFloat(fiatValueOfFees.toFixed(4)) : 0
  const liqFiatValue = fiatValueOfLiquidity ? parseFloat(fiatValueOfLiquidity.toFixed(4)) : 0
  const currencyETH =
    currency0 && currency1 && chainId
      ? token1Address == WETH9_EXTENDED[chainId]?.address
        ? currency1
        : currency0
      : currency1
  const baseSymbol =
    currencyQuote && currencyBase && chainId
      ? token1Address == WETH9_EXTENDED[chainId]?.address
        ? currencyBase.symbol
        : currencyQuote.symbol
      : ' '
  const tokenSymbol =
    currencyQuote && currencyBase && chainId
      ? token1Address == WETH9_EXTENDED[chainId]?.address
        ? currencyQuote.symbol
        : currencyBase.symbol
      : ' '
  const amtETH =
    position && chainId
      ? token1Address == WETH9_EXTENDED[chainId]?.address
        ? parseFloat(position?.amount1.toSignificant(5))
        : parseFloat(position?.amount0.toSignificant(5))
      : 0
  const amtTok =
    position && chainId
      ? token1Address == WETH9_EXTENDED[chainId]?.address
        ? parseFloat(position?.amount0.toSignificant(5))
        : parseFloat(position?.amount1.toSignificant(5))
      : 0
  const Pa =
    position && chainId && tickLower && tickUpper && pool
      ? token1Address == WETH9_EXTENDED[chainId]?.address
        ? 1.0001 ** tickLower * 10 ** (pool.token0.decimals - pool.token1.decimals)
        : 1.0001 ** -tickUpper * 10 ** (pool.token1.decimals - pool.token0.decimals)
      : 0
  const Pb =
    position && chainId && tickLower && tickUpper && pool
      ? token1Address == WETH9_EXTENDED[chainId]?.address
        ? 1.0001 ** tickUpper * 10 ** (pool.token0.decimals - pool.token1.decimals)
        : 1.0001 ** -tickLower * 10 ** (pool.token1.decimals - pool.token0.decimals)
      : 0
  const Pc =
    position && chainId && pool
      ? token1Address == WETH9_EXTENDED[chainId]?.address
        ? 1.0001 ** pool.tickCurrent * 10 ** (pool.token0.decimals - pool.token1.decimals)
        : 1.0001 ** -pool.tickCurrent * 10 ** (pool.token1.decimals - pool.token0.decimals)
      : 0
  const LiqValueTotal =
    position && chainId
      ? token1Address == WETH9_EXTENDED[chainId]?.address
        ? parseFloat(position?.amount1.toSignificant(4)) + parseFloat(position?.amount0.toSignificant(4)) * Pc
        : parseFloat(position?.amount0.toSignificant(4)) + parseFloat(position?.amount1.toSignificant(4)) * Pc
      : 0
  const feeValueETH =
    feeValue0 && feeValue1 && chainId
      ? token1Address == WETH9_EXTENDED[chainId]?.address
        ? parseFloat(feeValue1.toSignificant(6))
        : parseFloat(feeValue0.toSignificant(6))
      : 0
  const feeValueToken =
    feeValue0 && feeValue1 && chainId
      ? token1Address == WETH9_EXTENDED[chainId]?.address
        ? parseFloat(feeValue0.toSignificant(6))
        : parseFloat(feeValue1.toSignificant(6))
      : 0
  const feeValueTotal =
    feeValue0 && feeValue1 && chainId
      ? token1Address == WETH9_EXTENDED[chainId]?.address
        ? parseFloat(feeValue1.toSignificant(6)) + parseFloat(feeValue0.toSignificant(6)) * Pc
        : parseFloat(feeValue0.toSignificant(6)) + parseFloat(feeValue1.toSignificant(6)) * Pc
      : 0
  const strike = (Pb * Pa) ** 0.5
  const r = Pb > Pa ? (Pb / Pa) ** 0.5 : (Pa / Pb) ** 0.5
  const dp = Pb > Pa ? Pb - Pa : Pa - Pb
  const startPrice =
    pool && chainId
      ? depositedToken0 == 0 && token0Address == WETH9_EXTENDED[chainId]?.address
        ? Pa
        : depositedToken1 == 0 && token1Address == WETH9_EXTENDED[chainId]?.address
        ? Pa
        : depositedToken1 == 0 && token0Address == WETH9_EXTENDED[chainId]?.address
        ? Pb
        : depositedToken0 == 0 && token1Address == WETH9_EXTENDED[chainId]?.address
        ? Pb
        : token1Address == WETH9_EXTENDED[chainId]?.address
        ? ((10 ** pool.token1.decimals * depositedToken1) / positionLiquidity + Pa ** 0.5) ** 2
        : ((10 ** pool.token0.decimals * depositedToken0) / positionLiquidity + Pa ** 0.5) ** 2
      : Pa

  const dtot = position && liquidity ? liquidity : 0
  const dL = position
    ? Pc > Pa && Pc < Pb
      ? amtETH / (Pc ** 0.5 - Pa ** 0.5)
      : Pc < Pa
      ? amtTok / (Pa ** -0.5 - Pb ** -0.5)
      : amtETH / (Pb ** 0.5 - Pa ** 0.5)
    : 0
  const dE = (dL * (Pb ** 0.5 - startPrice ** 0.5)) / (Pb * startPrice) ** 0.5
  const baseValue =
    Pc < Pb && Pc > Pa
      ? (dE * (2 * (strike * startPrice * r) ** 0.5 - strike - startPrice)) / (r - 1)
      : Pc < Pa
      ? dE * startPrice
      : (dE * (2 * (strike * Pb * r) ** 0.5 - strike - Pb)) / (r - 1)
  //const BE = (feeValueTotal * (1 - r)) / dE + strike * (-2 * r ** 0.5 + 2 * r)
  const BE = (baseValue * (1 - r) - feeValueETH * (1 - r)) / (dE + feeValueToken * (1 - r))
  const Pe = (startPrice - feeValueETH / dE) / (1 + feeValueToken / dE)
  const Pmin = midpointStart
    ? Pa * 0.9 - dp
    : Pc < Pe
    ? Pc * 0.9
    : Pe < Pa - dp
    ? Pe * 0.9
    : Pc < Pa - dp
    ? Pc * 0.9
    : Pc > Pb + dp
    ? Pa * 0.9 - (Pc - Pb)
    : Pa * 0.9 - dp
  const Pmax = Pc > Pb + dp ? Pc * 1.1 : Pc < Pa - dp ? Pb * 1.1 + (Pa - Pc) : Pb * 1.1 + dp
  const topFees = dE * strike + feeValueTotal - baseValue
  const profit = removed
    ? collectedFeesToken1 - depositedToken1 + (collectedFeesToken0 - depositedToken1) * Pc
    : Pc < Pb && Pc > Pa
    ? (dE * (2 * (strike * Pc * r) ** 0.5 - strike - Pc)) / (r - 1) + feeValueETH + feeValueToken * Pc - baseValue
    : Pc < Pa
    ? dE * Pc + feeValueETH + feeValueToken * Pc - baseValue
    : dE * strike + feeValueETH + feeValueToken * Pc - baseValue
  const feeGuts0 =
    Pc < Pb && Pc > Pa
      ? feeGrowthGlobal0X128 - feeUpperOutside0X128 - feeLowerOutside0X128
      : feeUpperOutside0X128 - feeLowerOutside0X128
  const feeGuts1 =
    Pc < Pb && Pc > Pa
      ? feeGrowthGlobal1X128 - feeUpperOutside1X128 - feeLowerOutside1X128
      : feeUpperOutside1X128 - feeLowerOutside1X128
  const feeVal0 =
    feeGrowthInside0LastX128 > 2 ** 128
      ? ((feeGuts0 + parseInt(feeGrowthLast0.toString())) * positionLiquidity) / (2 ** 128 * 10 ** dec0)
      : ((feeGuts0 - feeGrowthInside0LastX128) * positionLiquidity) / (2 ** 128 * 10 ** dec0)

  const feeVal1 =
    feeGrowthInside1LastX128 > 2 ** 128
      ? ((feeGuts1 + parseInt(feeGrowthLast1.toString())) * positionLiquidity) / (2 ** 128 * 10 ** dec1)
      : ((feeGuts1 - feeGrowthInside1LastX128) * positionLiquidity) / (2 ** 128 * 10 ** dec1)
  const onOptimisticChain = chainId && [SupportedChainId.OPTIMISM, SupportedChainId.OPTIMISTIC_KOVAN].includes(chainId)
  const showCollectAsWeth = Boolean(
    ownsNFT &&
      (feeValue0?.greaterThan(0) || feeValue1?.greaterThan(0)) &&
      currency0 &&
      currency1 &&
      (currency0.isNative || currency1.isNative) &&
      !collectMigrationHash &&
      !onOptimisticChain
  )

  const tickX = currentPosition
    ? (currentPosition[0].pool.liquidity *
        (1.0001 ** (-currentPosition[0].pool.tick / 2 + currentPosition[0].pool.feeTier / 200) -
          1.0001 ** (-currentPosition[0].pool.tick / 2 - currentPosition[0].pool.feeTier / 200))) /
      10 ** 18
    : 0
  const tickY = currentPosition
    ? (currentPosition[0].pool.liquidity *
        (1.0001 ** (currentPosition[0].pool.tick / 2 + currentPosition[0].pool.feeTier / 200) -
          1.0001 ** (currentPosition[0].pool.tick / 2 - currentPosition[0].pool.feeTier / 200))) /
      10 ** 18
    : 0
  const tickTVL = tickX * parseFloat(ETHprice ? ETHprice.toFixed(2) : '1')
  const volumeUSD = currentPosition ? currentPosition[0].pool.poolDayData[0].volumeUSD : 1
  const volatility = currentPosition
    ? (2 * currentPosition[0].pool.feeTier * ((365 * volumeUSD) / tickTVL) ** 0.5) / 1000000
    : 0
  const nPt = 72
  const dataPayoff: any[] = []
  for (let pt = 0; pt <= nPt; pt++) {
    const xx = ((Pmax - Pmin) * pt) / nPt + Pmin
    const yy =
      xx < Pa
        ? dE * xx + feeValueETH + feeValueToken * xx - baseValue
        : xx >= Pa && xx < Pb
        ? (dE * (2 * (strike * xx * r) ** 0.5 - strike - xx)) / (r - 1) + feeValueETH + feeValueToken * xx - baseValue
        : xx >= Pb
        ? dE * strike + feeValueETH + feeValueToken * xx - baseValue
        : 0

    dataPayoff.push({ x: xx.toPrecision(5), y: yy.toPrecision(5) })
  }
  const breakEven = dataPayoff
    ? dataPayoff?.filter((obj) => obj.y >= 0)[0].x / 2 + dataPayoff?.reverse().filter((obj) => obj.y <= 0)[0].x / 2
    : Pa
  const dataH = [
    {
      x: Pmin.toPrecision(5),
      y: (dE * Pmin + feeValueETH + feeValueToken * Pmin - baseValue + (dE * (strike - Pmin)) / 2).toPrecision(5),
    },
    {
      x: Pa.toPrecision(5),
      y: (dE * Pa + feeValueETH + feeValueToken * Pa - baseValue + (dE * (strike - Pa)) / 2).toPrecision(5),
    },
    {
      x: Pb.toPrecision(5),
      y: (dE * Pb + feeValueETH + feeValueToken * Pb - baseValue + (dE * (strike - Pb)) / 2).toPrecision(5),
    },
    {
      x: Pmax.toPrecision(5),
      y: (dE * strike + feeValueETH + feeValueToken * Pmax - baseValue + (dE * (strike - Pmax)) / 2).toPrecision(5),
    },
  ]
  const dataPc = [
    {
      x: Pc.toPrecision(5),
      y:
        Pc < Pb && Pc > Pa
          ? (
              (dE * (2 * (strike * Pc * r) ** 0.5 - strike - Pc)) / (r - 1) +
              feeValueETH +
              feeValueToken * Pc -
              baseValue
            ).toPrecision(3)
          : Pc < Pa
          ? (dE * Pc + feeValueETH + feeValueToken * Pc - baseValue).toPrecision(3)
          : (dE * strike + feeValueETH + feeValueToken * Pc - baseValue).toPrecision(3),
      z: 7.5,
    },
  ]
  const dataPe = [
    {
      x: breakEven.toPrecision(5),
      y: 0,
      z: 7.5,
    },
  ]
  const dataPerf = [
    {
      x: Pe.toPrecision(5),
      y: (1 / (6.28 * 0.05 * Pe * 7 ** 0.5)) * Math.exp((Math.log(Pe) - Math.log(Pc)) ** 2),
      z: 20,
    },
  ]
  const vol = pool ? pool.liquidity : 0
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

  function modalHeader() {
    return (
      <AutoColumn gap={'md'} style={{ marginTop: '20px' }}>
        <LightCard padding="12px 16px">
          <AutoColumn gap="md">
            <RowBetween>
              <RowFixed>
                <CurrencyLogo currency={feeValueUpper?.currency} size={'20px'} style={{ marginRight: '0.5rem' }} />
                <TYPE.main>{feeValueUpper ? formatCurrencyAmount(feeValueUpper, 4) : '-'}</TYPE.main>
              </RowFixed>
              <TYPE.main>{feeValueUpper?.currency?.symbol}</TYPE.main>
            </RowBetween>
            <RowBetween>
              <RowFixed>
                <CurrencyLogo currency={feeValueLower?.currency} size={'20px'} style={{ marginRight: '0.5rem' }} />
                <TYPE.main>{feeValueLower ? formatCurrencyAmount(feeValueLower, 4) : '-'}</TYPE.main>
              </RowFixed>
              <TYPE.main>{feeValueLower?.currency?.symbol}</TYPE.main>
            </RowBetween>
          </AutoColumn>
        </LightCard>
        <TYPE.italic>
          <Trans>Collecting fees will withdraw currently available fees for you.</Trans>
        </TYPE.italic>
        <ButtonPrimary onClick={collect}>
          <Trans>Collect</Trans>
        </ButtonPrimary>
      </AutoColumn>
    )
  }
  return loading || poolState === PoolState.LOADING || !feeAmount ? (
    <LoadingRows>
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
    </LoadingRows>
  ) : (
    <>
      <PageWrapper>
        <TransactionConfirmationModal
          isOpen={showConfirm}
          onDismiss={() => setShowConfirm(false)}
          attemptingTxn={collecting}
          hash={collectMigrationHash ?? ''}
          content={() => (
            <ConfirmationModalContent
              title={<Trans>Claim fees</Trans>}
              onDismiss={() => setShowConfirm(false)}
              topContent={modalHeader}
            />
          )}
          pendingText={<Trans>Collecting fees</Trans>}
        />
        <AutoColumn gap="md">
          <AutoColumn gap="sm">
            <Link style={{ textDecoration: 'none', width: 'fit-content', marginBottom: '0.5rem' }} to="/pool">
              <HoverText>
                <Trans>← Back to Pools Overview:</Trans>
              </HoverText>
            </Link>
            <ResponsiveRow>
              <RowFixed>
                <DoubleCurrencyLogo currency0={currencyBase} currency1={currencyQuote} size={24} margin={true} />
                <TYPE.label fontSize={'24px'} mr="10px">
                  &nbsp;{currencyQuote?.symbol}&nbsp;/&nbsp;{currencyBase?.symbol}
                </TYPE.label>
                <Badge style={{ marginRight: '8px' }}>
                  <BadgeText>
                    <Trans>{new Percent(feeAmount, 1_000_000).toSignificant()}%</Trans>
                  </BadgeText>
                </Badge>
                <RangeBadge removed={removed} inRange={inRange} aboveRange={!above} belowRange={!below} />
              </RowFixed>
            </ResponsiveRow>
            <RowBetween></RowBetween>
          </AutoColumn>
          <ResponsiveRow align="flex-start">
            {'result' in metadata ? (
              <DarkCard
                width="100%"
                height="100%"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexDirection: 'column',
                  justifyContent: 'space-around',
                  marginRight: '12px',
                }}
              >
                <div style={{ marginRight: 12 }}>
                  <ComposedChart
                    width={375}
                    height={400}
                    data={dataPayoff}
                    margin={{
                      top: 50,
                      right: 10,
                      left: 10,
                      bottom: 40,
                    }}
                  >
                    <defs>
                      <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset={off} stopColor="green" stopOpacity={1} />
                        <stop offset={off} stopColor="red" stopOpacity={1} />
                      </linearGradient>
                    </defs>
                    <ReferenceArea
                      x1={Pmin}
                      x2={Pa}
                      y1={dE * strike + feeValueTotal - baseValue}
                      y2={dE * strike * 1.125 + feeValueTotal - baseValue}
                      fillOpacity={0}
                      label={'100% token'}
                    />
                    <ReferenceArea
                      x1={Pb}
                      x2={Pmax}
                      y1={dE * strike + feeValueTotal - baseValue}
                      y2={dE * strike * 1.125 + feeValueTotal - baseValue}
                      fillOpacity={0}
                      label={'100% ETH'}
                    />
                    <ReferenceArea
                      x1={Pa}
                      x2={Pb}
                      y1={dE * Pmin - baseValue}
                      y2={dE * strike * 1.125 + feeValueTotal - baseValue}
                      fillOpacity={0.33}
                    />
                    <Area type="basis" dataKey="y" stroke="#000" fill="url(#splitColor)" activeDot={false} />
                    <ReferenceLine
                      y={dE * strike + feeValueETH + feeValueToken * Pb - baseValue}
                      stroke="#000"
                      strokeDasharray="1 4"
                    />
                    <ReferenceLine y={0} stroke="#000" />
                    <Scatter data={dataPc} />
                    <Scatter data={dataPe} />
                    <Scatter line={{ stroke: '#000', strokeWidth: 1.5 }} data={dataPayoff} dataKey="x" />
                    <Tooltip
                      labelFormatter={() => ' '}
                      allowEscapeViewBox={{
                        x: true,
                        y: true,
                      }}
                      position={{ x: 238, y: 225 }}
                      coordinate={{ x: -100, y: 10 }}
                      cursor={{ stroke: 'red', strokeWidth: 1 }}
                    />
                    <ReferenceArea
                      x1={Pmin}
                      x2={Pmax}
                      y1={(dE * Pmin) / 1.125 - baseValue}
                      y2={dE * Pmin - baseValue}
                      fillOpacity={100}
                      fill={'#fff'}
                      label={'Profit: ' + profit.toPrecision(6) + ' ' + currencyETH?.symbol}
                    />
                    <XAxis
                      dataKey="x"
                      name="Price"
                      textAnchor="end"
                      interval={0}
                      angle={-45}
                      tick={{ fontSize: 10 }}
                      ticks={[Pe.toPrecision(3), Pa.toPrecision(3), Pc.toPrecision(3), Pb.toPrecision(3)]}
                      domain={[Pmin, Pmax]}
                      type="number"
                      label={{ value: 'Price', position: 'insideBottomRight', offset: 0 }}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      allowDecimals={false}
                      interval={0}
                      ticks={[
                        0,
                        dataPc[0].y,
                        (dE * strike + feeValueETH + feeValueToken * Pb - baseValue).toPrecision(3),
                      ]}
                      dataKey="y"
                      domain={[(dE * Pmin) / 1.125 - baseValue, dE * strike * 1.125 + feeValueTotal - baseValue]}
                      label={{ value: 'Profit/Loss', angle: -90, position: 'insideLeft', offset: 5 }}
                    />
                    <ZAxis type="number" dataKey="z" range={[1, 100]} />
                  </ComposedChart>
                </div>
              </DarkCard>
            ) : (
              <DarkCard
                width="100%"
                height="100%"
                style={{
                  marginRight: '12px',
                  minWidth: '340px',
                }}
              >
                <Loader />
              </DarkCard>
            )}
            <AutoColumn gap="sm" style={{ width: '100%', height: '100%' }}>
              <DarkCard>
                <AutoColumn gap="md" style={{ width: '100%' }}>
                  <AutoColumn gap="md">
                    <Label>
                      <Trans>Liquidity</Trans>
                    </Label>
                    {fiatValueOfLiquidity?.greaterThan(new Fraction(1, 100)) ? (
                      <TYPE.largeHeader color={theme.green1} fontSize="24px" fontWeight={500}>
                        <ResponsiveRow>
                          <RowFixed>
                            <Trans>${fiatValueOfLiquidity.toFixed(2, { groupSeparator: ',' })}</Trans>
                          </RowFixed>
                          <RowFixed>
                            <Trans>
                              <CurrencyLogo currency={currencyETH} size={'20px'} style={{ marginRight: '0.5rem' }} />
                              {LiqValueTotal?.toFixed(2)}
                            </Trans>
                          </RowFixed>
                        </ResponsiveRow>
                      </TYPE.largeHeader>
                    ) : (
                      <TYPE.largeHeader color={theme.text1} fontSize="36px" fontWeight={500}>
                        <Trans>$-</Trans>
                      </TYPE.largeHeader>
                    )}
                  </AutoColumn>
                  <LightCard padding="12px 16px">
                    <AutoColumn gap="md">
                      <RowBetween>
                        <LinkedCurrency chainId={chainId} currency={currencyQuote} />
                        <RowFixed>
                          <TYPE.main>
                            {inverted ? position?.amount0.toSignificant(4) : position?.amount1.toSignificant(4)}
                          </TYPE.main>
                          {typeof ratio === 'number' && !removed ? (
                            <Badge style={{ marginLeft: '10px' }}>
                              <TYPE.main fontSize={11}>
                                <Trans>{inverted ? ratio : 100 - ratio}%</Trans>
                              </TYPE.main>
                            </Badge>
                          ) : null}
                        </RowFixed>
                      </RowBetween>
                      <RowBetween>
                        <LinkedCurrency chainId={chainId} currency={currencyBase} />
                        <RowFixed>
                          <TYPE.main>
                            {inverted ? position?.amount1.toSignificant(4) : position?.amount0.toSignificant(4)}
                          </TYPE.main>
                          {typeof ratio === 'number' && !removed ? (
                            <Badge style={{ marginLeft: '10px' }}>
                              <TYPE.main color={theme.text2} fontSize={11}>
                                <Trans>{inverted ? 100 - ratio : ratio}%</Trans>
                              </TYPE.main>
                            </Badge>
                          ) : null}
                        </RowFixed>
                      </RowBetween>
                    </AutoColumn>
                  </LightCard>
                  {ownsNFT && (
                    <RowFixed>
                      {currency0 && currency1 && feeAmount && tokenId ? (
                        <ButtonGray
                          as={Link}
                          to={`/increase/${currencyId(currency0)}/${currencyId(currency1)}/${feeAmount}/${tokenId}`}
                          width="fit-content"
                          padding="6px 8px"
                          $borderRadius="4px"
                          style={{ marginLeft: '8px', marginRight: '24px' }}
                        >
                          <Trans>Increase Liquidity</Trans>
                        </ButtonGray>
                      ) : null}
                      {tokenId && !removed ? (
                        <ResponsiveButtonPrimary
                          as={Link}
                          to={`/remove/${tokenId}`}
                          width="fit-content"
                          padding="6px 8px"
                          $borderRadius="4px"
                          style={{ marginLeft: '24px', marginRight: '0px' }}
                        >
                          <Trans>Remove Liquidity</Trans>
                        </ResponsiveButtonPrimary>
                      ) : null}
                    </RowFixed>
                  )}
                </AutoColumn>
              </DarkCard>
              <DarkCard>
                <AutoColumn gap="md" style={{ width: '100%' }}>
                  <AutoColumn gap="md">
                    <Label>
                      <Trans>
                        Unclaimed fees:
                        <br />
                      </Trans>
                    </Label>
                    {fiatValueOfFees?.greaterThan(new Fraction(1, 100)) ? (
                      <TYPE.largeHeader color={theme.green1} fontSize="24px" fontWeight={500}>
                        <ResponsiveRow>
                          <RowFixed>
                            <Trans>${fiatValueOfFees.toFixed(2, { groupSeparator: ',' })}</Trans>
                          </RowFixed>
                          <RowFixed>
                            <Trans>
                              <CurrencyLogo currency={currencyETH} size={'20px'} style={{ marginRight: '0.5rem' }} />
                              {feeValueTotal.toPrecision(3)}
                            </Trans>
                          </RowFixed>
                        </ResponsiveRow>
                      </TYPE.largeHeader>
                    ) : (
                      <TYPE.largeHeader color={theme.text1} fontSize="36px" fontWeight={500}>
                        <Trans>$-</Trans>
                      </TYPE.largeHeader>
                    )}
                  </AutoColumn>
                  <LightCard padding="12px 16px">
                    <AutoColumn gap="md">
                      <RowBetween>
                        <RowFixed>
                          <CurrencyLogo
                            currency={feeValueUpper?.currency}
                            size={'20px'}
                            style={{ marginRight: '0.5rem' }}
                          />
                          <TYPE.main>{feeValueUpper?.currency?.symbol}</TYPE.main>
                        </RowFixed>
                        <RowFixed>
                          <TYPE.main>{feeValueUpper ? formatCurrencyAmount(feeValueUpper, 4) : '-'}</TYPE.main>
                        </RowFixed>
                      </RowBetween>
                      <RowBetween>
                        <RowFixed>
                          <CurrencyLogo
                            currency={feeValueLower?.currency}
                            size={'20px'}
                            style={{ marginRight: '0.5rem' }}
                          />
                          <TYPE.main>{feeValueLower?.currency?.symbol}</TYPE.main>
                        </RowFixed>
                        <RowFixed>
                          <TYPE.main>{feeValueLower ? formatCurrencyAmount(feeValueLower, 4) : '-'}</TYPE.main>
                        </RowFixed>
                      </RowBetween>
                    </AutoColumn>
                  </LightCard>
                  {showCollectAsWeth && (
                    <AutoColumn gap="md">
                      <RowBetween>
                        <TYPE.main>
                          {ownsNFT &&
                          (feeValue0?.greaterThan(0) || feeValue1?.greaterThan(0) || !!collectMigrationHash) ? (
                            <ButtonConfirmed
                              disabled={collecting || !!collectMigrationHash}
                              confirmed={!!collectMigrationHash && !isCollectPending}
                              width="fit-content"
                              style={{ borderRadius: '4px' }}
                              padding="4px 8px"
                              onClick={() => setShowConfirm(true)}
                            >
                              {!!collectMigrationHash && !isCollectPending ? (
                                <TYPE.main color={theme.text1}>
                                  <Trans> Collected</Trans>
                                </TYPE.main>
                              ) : isCollectPending || collecting ? (
                                <TYPE.main color={theme.text1}>
                                  {' '}
                                  <Dots>
                                    <Trans>Collecting</Trans>
                                  </Dots>
                                </TYPE.main>
                              ) : (
                                <>
                                  <TYPE.main color={theme.white}>
                                    <Trans>Collect fees</Trans>
                                  </TYPE.main>
                                </>
                              )}
                            </ButtonConfirmed>
                          ) : null}
                        </TYPE.main>
                        <TYPE.main>
                          <Trans>→ Collect as WETH:</Trans>
                        </TYPE.main>
                        <Toggle
                          id="receive-as-weth"
                          isActive={receiveWETH}
                          toggle={() => setReceiveWETH((receiveWETH) => !receiveWETH)}
                        />
                      </RowBetween>
                    </AutoColumn>
                  )}
                </AutoColumn>
              </DarkCard>
            </AutoColumn>
          </ResponsiveRow>
          <DarkCard>
            <AutoColumn gap="md">
              <RowBetween>
                <RowFixed>
                  <Label display="flex" style={{ marginRight: '12px' }}>
                    <Trans>Price range</Trans>
                  </Label>
                  <HideExtraSmall>
                    <>
                      <RangeBadge removed={removed} inRange={inRange} aboveRange={!above} belowRange={!below} />
                      <span style={{ width: '8px' }} />
                    </>
                  </HideExtraSmall>
                </RowFixed>
                <RowFixed>
                  {currencyBase && currencyQuote && (
                    <RateToggle
                      currencyA={currencyBase}
                      currencyB={currencyQuote}
                      handleRateToggle={() => setManuallyInverted(!manuallyInverted)}
                    />
                  )}
                </RowFixed>
              </RowBetween>

              <RowBetween>
                <LightCard padding="12px" width="100%">
                  <AutoColumn gap="8px" justify="center">
                    <ExtentsText>
                      <Trans>Min price</Trans>
                    </ExtentsText>
                    <TYPE.mediumHeader textAlign="center">
                      {formatTickPrice(priceLower, tickAtLimit, Bound.LOWER)}
                    </TYPE.mediumHeader>
                    <ExtentsText>
                      {' '}
                      <Trans>
                        {currencyQuote?.symbol} per {currencyBase?.symbol}
                      </Trans>
                    </ExtentsText>

                    {inRange && (
                      <TYPE.small color={theme.text3}>
                        <Trans>Your position will be 100% {currencyBase?.symbol} at this price.</Trans>
                      </TYPE.small>
                    )}
                  </AutoColumn>
                </LightCard>
                <AutoColumn gap="18px" justify="center">
                  <DoubleArrow>⟷</DoubleArrow>
                </AutoColumn>
                <LightCard padding="12px" width="100%">
                  <AutoColumn gap="8px" justify="center">
                    <ExtentsText>
                      <Trans>Max price</Trans>
                    </ExtentsText>
                    <TYPE.mediumHeader textAlign="center">
                      {formatTickPrice(priceUpper, tickAtLimit, Bound.UPPER)}
                    </TYPE.mediumHeader>
                    <ExtentsText>
                      {' '}
                      <Trans>
                        {currencyQuote?.symbol} per {currencyBase?.symbol}
                      </Trans>
                    </ExtentsText>

                    {inRange && (
                      <TYPE.small color={theme.text3}>
                        <Trans>Your position will be 100% {currencyQuote?.symbol} at this price.</Trans>
                      </TYPE.small>
                    )}
                  </AutoColumn>
                </LightCard>
              </RowBetween>
              <CurrentPriceCard
                inverted={inverted}
                pool={pool}
                currencyQuote={currencyQuote}
                currencyBase={currencyBase}
                r={r}
                strike={strike}
                owner={owner}
                poolAddress={poolAddress}
                chainId={chainId}
              />
            </AutoColumn>
          </DarkCard>
        </AutoColumn>
      </PageWrapper>
      <SwitchLocaleLink />
    </>
  )
}
