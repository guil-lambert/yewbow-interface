import { BigNumber } from '@ethersproject/bignumber'
import { TransactionResponse } from '@ethersproject/providers'
import { Trans } from '@lingui/macro'
import { Currency, CurrencyAmount, Fraction, Percent, Price, Token } from '@uniswap/sdk-core'
import { NonfungiblePositionManager, Pool, Position } from '@uniswap/v3-sdk'
import Badge from 'components/Badge'
import { ButtonConfirmed, ButtonGray, ButtonPrimary } from 'components/Button'
import { DarkCard, LightCard } from 'components/Card'
import { AutoColumn } from 'components/Column'
import Confetti from 'components/Confetti'
import CurrencyLogo from 'components/CurrencyLogo'
import DoubleCurrencyLogo from 'components/DoubleLogo'
import Loader from 'components/Loader'
import { RowBetween, RowFixed } from 'components/Row'
import { Dots } from 'components/swap/styleds'
import Toggle from 'components/Toggle'
import TransactionConfirmationModal, { ConfirmationModalContent } from 'components/TransactionConfirmationModal'
import { SupportedChainId } from 'constants/chains'
import { useToken } from 'hooks/Tokens'
import { useV3NFTPositionManagerContract } from 'hooks/useContract'
import useIsTickAtLimit from 'hooks/useIsTickAtLimit'
import { PoolState, usePool } from 'hooks/usePools'
import useUSDCPrice from 'hooks/useUSDCPrice'
import { useV3PositionFees } from 'hooks/useV3PositionFees'
import { useAllPositions, useV3PositionFromTokenId } from 'hooks/useV3Positions'
import { useActiveWeb3React } from 'hooks/web3'
import { erf, log } from 'mathjs'
import React, { useCallback, useMemo, useState } from 'react'
import Collapsible from 'react-collapsible'
import ReactGA from 'react-ga'
import { Link, RouteComponentProps } from 'react-router-dom'
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
import { Bound } from 'state/mint/v3/actions'
import { useSingleCallResult } from 'state/multicall/hooks'
import { useIsTransactionPending, useTransactionAdder } from 'state/transactions/hooks'
import styled from 'styled-components/macro'
import { ExternalLink, HideExtraSmall, TYPE } from 'theme'
import { currencyId } from 'utils/currencyId'
import { formatCurrencyAmount } from 'utils/formatCurrencyAmount'
import { formatTickPrice } from 'utils/formatTickPrice'

import RangeBadge from '../../components/Badge/RangeBadge'
import { getPriceOrderingFromPositionForUI } from '../../components/PositionListItem'
import RateToggle from '../../components/RateToggle'
import { SwitchLocaleLink } from '../../components/SwitchLocaleLink'
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
  tokenId,
  amountDepositedUSD,
  amountCollectedUSD,
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
  tokenId?: number
  amountDepositedUSD?: string
  amountCollectedUSD?: string
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
              <TYPE.mediumHeader textAlign="center">Pool/Position Links</TYPE.mediumHeader>
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
              <ExternalLink href={'https://info.yewbow.org/#/pools/' + poolAddress.toLowerCase()}>
                <Trans>Pool info</Trans>
              </ExternalLink>
            </ExtentsText>
            <ExtentsText>
              <ExternalLink href={'https://etherscan.io/nft/0xc36442b4a4522e871399cd717abdd847ab11fe88/' + tokenId}>
                <Trans>See NFT</Trans>
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
            <ExtentsText>
              <TYPE.small textAlign="center">
                <b>Value deposited:</b> {amountDepositedUSD ? parseFloat(amountDepositedUSD).toFixed(2) : '-'}USD
              </TYPE.small>
            </ExtentsText>
            <ExtentsText>
              <TYPE.small textAlign="center">
                <b>Value collected:</b> {amountCollectedUSD ? parseFloat(amountCollectedUSD).toFixed(2) : '-'}USD
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
  } = positionDetails || {}
  const addTransaction = useTransactionAdder()
  const positionManager = useV3NFTPositionManagerContract()

  const owner = useSingleCallResult(!!tokenId ? positionManager : null, 'ownerOf', [tokenId]).result?.[0]
  const ownsIt = account ? (owner === account ? true : false) : false
  const positions = useAllPositions(
    ownsIt ? (account ? account : undefined) : owner,
    '0x',
    tokenId ? tokenId.toString() : '0',
    1
  )

  const removed = liquidity?.eq(0)

  const token0 = useToken(token0Address)
  const token1 = useToken(token1Address)

  const metadata = usePositionTokenURI(parsedTokenId)

  // flag for receiving WETH
  const [receiveWETH, setReceiveWETH] = useState(true)
  const currency0 = token0 ? token0 : undefined
  const currency1 = token1 ? token1 : undefined

  // construct Position from details returned
  const [poolState, pool] = usePool(token0 ?? undefined, token1 ?? undefined, feeAmount)
  const position = useMemo(() => {
    if (pool && liquidity && typeof tickLower === 'number' && typeof tickUpper === 'number') {
      return new Position({ pool, liquidity: liquidity.toString(), tickLower, tickUpper })
    }
    return undefined
  }, [liquidity, pool, tickLower, tickUpper])

  const tickAtLimit = useIsTickAtLimit(feeAmount, tickLower, tickUpper)

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
  const [radioState, setradioState] = useState('')

  const [collecting, setCollecting] = useState<boolean>(false)
  const [collectMigrationHash, setCollectMigrationHash] = useState<string | null>(null)
  const isCollectPending = useIsTransactionPending(collectMigrationHash ?? undefined)
  const [showConfirm, setShowConfirm] = useState(false)

  // usdc prices always in terms of tokens
  const price0 = useUSDCPrice(token0 ?? undefined)
  const price1 = useUSDCPrice(token1 ?? undefined)

  const fiatValueOfFees: CurrencyAmount<Currency> | null = useMemo(() => {
    if (!price0 || !price1 || !feeValue0 || !feeValue1 || !tokenId) return null

    // we wrap because it doesn't matter, the quote returns a USDC amount
    const feeValue0Wrapped = feeValue0?.wrapped
    const feeValue1Wrapped = feeValue1?.wrapped

    if (!feeValue0Wrapped || !feeValue1Wrapped) return null

    const amount0 = price0.quote(feeValue0Wrapped)
    const amount1 = price1.quote(feeValue1Wrapped)
    localStorage.setItem(tokenId ? tokenId.toString() : '0', JSON.stringify(amount0.add(amount1)))
    return amount0.add(amount1)
  }, [price0, price1, feeValue0, feeValue1, tokenId])

  const fiatValueOfLiquidity: CurrencyAmount<Token> | null = useMemo(() => {
    if (!price0 || !price1 || !position) return null
    const amount0 = price0.quote(position.amount0)
    const amount1 = price1.quote(position.amount1)
    return amount0.add(amount1)
  }, [price0, price1, position])

  const fiatValueOfPosition =
    price0 && price1 && position ? price0.quote(position.amount0).add(price1.quote(position.amount1)) : 0
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

  const currentPosition =
    tokenId && positions.positions ? positions.positions.filter((obj) => obj.id == tokenId.toString()) : 0
  const depositedToken0 = currentPosition != 0 ? currentPosition[0].depositedToken0 : 1
  const depositedToken1 = currentPosition != 0 ? currentPosition[0].depositedToken1 : 1
  //const collectedFeesToken0 = currentPosition != 0 ? currentPosition[0].collectedFeesToken0 : 1
  //const collectedFeesToken1 = currentPosition != 0 ? currentPosition[0].collectedFeesToken1 : 1
  const positionLiquidity = currentPosition != 0 ? currentPosition[0].liquidity : 1
  const feeGrowthInside0LastX128 = currentPosition != 0 ? currentPosition[0].feeGrowthInside0LastX128 : 1
  const feeGrowthInside1LastX128 = currentPosition != 0 ? currentPosition[0].feeGrowthInside1LastX128 : 1
  const b256 = BigNumber.from('115792089237316195423570985008687907853269984665640564039457584007913129639936')
  //const b128 = BigNumber.from('340282366920938463463374607431768211456')
  const feeGrowthLast0 = b256.sub(BigNumber.from(feeGrowthInside0LastX128))
  const feeGrowthLast1 = b256.sub(BigNumber.from(feeGrowthInside1LastX128))
  const feeGrowthGlobal0X128 = currentPosition != 0 ? currentPosition[0].pool.feeGrowthGlobal0X128 : 1
  const feeGrowthGlobal1X128 = currentPosition != 0 ? currentPosition[0].pool.feeGrowthGlobal1X128 : 1
  const feeLowerOutside0X128 = currentPosition != 0 ? currentPosition[0].tickLower.feeGrowthOutside0X128 : 1
  const feeLowerOutside1X128 = currentPosition != 0 ? currentPosition[0].tickLower.feeGrowthOutside1X128 : 1
  const feeUpperOutside0X128 = currentPosition != 0 ? currentPosition[0].tickUpper.feeGrowthOutside0X128 : 1
  const feeUpperOutside1X128 = currentPosition != 0 ? currentPosition[0].tickUpper.feeGrowthOutside1X128 : 1
  const amountDepositedUSD = currentPosition != 0 ? currentPosition[0].amountDepositedUSD : 1
  //const amountWithdrawnUSD = currentPosition != 0 ? currentPosition[0].amountWithdrawnUSD : 1
  const amountCollectedUSD = currentPosition != 0 ? currentPosition[0].amountCollectedUSD : 1
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

  const currencyETH =
    currency0 && currency1 && chainId
      ? token1Address == WETH9_EXTENDED[chainId]?.address
        ? currency1
        : currency0
      : currency1
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
  const startPriceInit =
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
        ? ((10 ** (pool.token1.decimals / 2 + pool.token0.decimals / 2) * depositedToken1) / positionLiquidity +
            Pa ** 0.5) **
          2
        : ((10 ** (pool.token0.decimals / 2 + pool.token1.decimals / 2) * depositedToken0) / positionLiquidity +
            Pa ** 0.5) **
          2
      : Pa
  const startPrice = startPriceInit > 10 ** 24 ? Pa : startPriceInit
  const startRatio = 1 - (((strike * r) / startPrice) ** 0.5 - 1) / (r - 1)
  //const shortAmount = 0.5 // Fraction of the position that is shorted, in fraction of total liquidity (0,1)
  const shortAmount = radioState ? Number(radioState) : 0 // Fraction of the position that is shorted, in fraction of total liquidity (0,1)
  const dL = position
    ? Pc > Pa && Pc < Pb
      ? amtETH / (Pc ** 0.5 - Pa ** 0.5)
      : Pc < Pa
      ? amtTok / (Pa ** -0.5 - Pb ** -0.5)
      : amtETH / (Pb ** 0.5 - Pa ** 0.5)
    : 0
  const dE =
    startPrice < Pb
      ? (dL * (Pb ** 0.5 - startPrice ** 0.5)) / (Pb * startPrice) ** 0.5
      : (dL * (startPrice ** 0.5 - Pa ** 0.5)) / startPrice
  const baseValue =
    startPrice < Pb && startPrice > Pa
      ? (dE * (2 * (strike * startPrice * r) ** 0.5 - strike - startPrice)) / (r - 1)
      : startPrice <= Pa
      ? dE * startPrice
      : (dE * (2 * (strike * Pb * r) ** 0.5 - strike - Pb)) / (r - 1)
  //const BE = (feeValueTotal * (1 - r)) / dE + strike * (-2 * r ** 0.5 + 2 * r)
  const Pmin = Pc < Pa - dp ? Pc * 0.66 : Pc > Pb + dp ? Pa * 0.66 - (Pc - Pb) : Pa * 0.66 - dp
  const Pmax = Pc > Pb + dp ? Pc * 1.5 : Pc < Pa - dp ? Pb * 1.5 + (Pa - Pc) : Pb * 1.5 + dp
  const profit = removed
    ? amountCollectedUSD - amountDepositedUSD
    : Pc < Pb && Pc > Pa
    ? (dE * (2 * (strike * Pc * r) ** 0.5 - strike - Pc)) / (r - 1) +
      feeValueETH +
      feeValueToken * Pc -
      baseValue -
      dE * shortAmount * (Pc - startPrice)
    : Pc < Pa
    ? dE * Pc + feeValueETH + feeValueToken * Pc - baseValue - dE * shortAmount * (Pc - startPrice)
    : dE * strike + feeValueETH + feeValueToken * Pc - baseValue - dE * shortAmount * (Pc - startPrice)
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

  const tickX =
    currentPosition != 0
      ? (currentPosition[0].pool.liquidity *
          (1.0001 ** (-currentPosition[0].pool.tick / 2 + currentPosition[0].pool.feeTier / 200) -
            1.0001 ** (-currentPosition[0].pool.tick / 2 - currentPosition[0].pool.feeTier / 200))) /
        10 ** 18
      : 0
  const tickY =
    currentPosition != 0
      ? (currentPosition[0].pool.liquidity *
          (1.0001 ** (currentPosition[0].pool.tick / 2 + currentPosition[0].pool.feeTier / 200) -
            1.0001 ** (currentPosition[0].pool.tick / 2 - currentPosition[0].pool.feeTier / 200))) /
        10 ** 18
      : 0
  const tickTVL =
    token0 == currencyETH
      ? tickX * parseFloat(ETHprice ? ETHprice.toFixed(2) : '1')
      : tickY * parseFloat(ETHprice ? ETHprice.toFixed(2) : '1')

  const startDate = currentPosition != 0 ? currentPosition[0].transaction.timestamp : undefined
  const endDate = currentPosition != 0 ? currentPosition[0].pool.poolDayData[0].date : undefined

  const dayData = currentPosition != 0 ? currentPosition[0].pool.poolDayData : 0
  const dayData1 =
    dayData != 0
      ? dayData.map((i) => {
          return {
            date: i.date,
            price:
              token0 == currencyETH
                ? parseFloat(i.token0Price).toPrecision(4)
                : parseFloat(i.token1Price).toPrecision(4),
          }
        })
      : [{ date: 0, price: 0 }]

  const volumeUSD = dayData != 0 ? dayData[0].volumeUSD : 1
  const volatility =
    currentPosition != 0 ? (2 * currentPosition[0].pool.feeTier * ((365 * volumeUSD) / tickTVL) ** 0.5) / 1000000 : 0
  const dte = (((2 * 3.1416) / volatility ** 2) * (r ** 0.5 - 1) ** 2) / (r ** 0.5 + 1) ** 2
  const d1log = log(Pc / strike) / (volatility * dte ** 0.5)
  const d1const = volatility * dte ** 0.5
  const d1 = d1log + d1const
  const d2log = log(Pc / strike) / (volatility * dte ** 0.5)
  const d2const = volatility * dte ** 0.5
  const d2 = d2log - d2const
  const delta = d1 ? 0.5 - 0.5 * erf(d1 / 2 ** 0.5) - shortAmount : 0
  const optionValue = Pc / 2 + (Pc * erf(d1 / 2 ** 0.5)) / 2 - strike / 2 - (strike * erf(d2 / 2 ** 0.5)) / 2
  const expectedReturns = optionValue / Pc
  const expectedReturnsUSD = (amountDepositedUSD * optionValue) / Pc
  const calculatedReturns = parseFloat(amountDepositedUSD) + expectedReturnsUSD
  const returnColor = fiatValueOfPosition.toFixed(2) > calculatedReturns.toFixed(2) ? theme.green1 : theme.red1
  const nPt = 192
  const dataPayoff: any[] = []
  const dataPayoffX: any[] = []
  const dataPayoffY: any[] = []
  for (let pt = 0; pt <= nPt; pt++) {
    const xx = ((Pmax * r - Pmin / r) * pt) / nPt + Pmin / r
    const yy =
      xx < Pa
        ? dE * xx + feeValueETH + feeValueToken * xx - baseValue - dE * shortAmount * (xx - startPrice)
        : xx >= Pa && xx < Pb
        ? (dE * (2 * (strike * xx * r) ** 0.5 - strike - xx)) / (r - 1) +
          feeValueETH +
          feeValueToken * xx -
          baseValue -
          dE * shortAmount * (xx - startPrice)
        : xx >= Pb
        ? dE * strike + feeValueETH + feeValueToken * xx - baseValue - dE * shortAmount * (xx - startPrice)
        : 0
    dataPayoff.push({ x: xx.toPrecision(5), y: yy.toPrecision(5) })
    dataPayoffX.push(xx.toPrecision(5))
    dataPayoffY.push(yy.toPrecision(5))
  }
  const dPXr = dataPayoffX.slice().reverse()
  const dPYr = dataPayoffY.slice().reverse()
  const breakEven0 = dataPayoffY[0] < 0 ? dataPayoffX[dataPayoffY.findIndex((obj) => obj > 0)] : 0
  const breakEven1 = dPYr[0] < 0 ? dPXr[dPYr.findIndex((obj) => obj > 0)] : 10 * Pb

  const dte28 = 28 / 365
  const PoP =
    (-erf((volatility ** 2 * dte28 + 2 * log(breakEven0 / Pc)) / (2 ** 1.5 * volatility * dte28 ** 0.5)) +
      erf((volatility ** 2 * dte28 + 2 * log(breakEven1 / Pc)) / (2 ** 1.5 * volatility * dte28 ** 0.5))) /
    2

  const dataPc = [
    {
      label: 'spot',
      x: Pc.toPrecision(5),
      y:
        Pc < Pb && Pc > Pa
          ? (
              (dE * (2 * (strike * Pc * r) ** 0.5 - strike - Pc)) / (r - 1) +
              feeValueETH +
              feeValueToken * Pc -
              baseValue -
              dE * shortAmount * (Pc - startPrice)
            ).toPrecision(3)
          : Pc < Pa
          ? (dE * Pc + feeValueETH + feeValueToken * Pc - baseValue - dE * shortAmount * (Pc - startPrice)).toPrecision(
              3
            )
          : (
              dE * strike +
              feeValueETH +
              feeValueToken * Pc -
              baseValue -
              dE * shortAmount * (Pc - startPrice)
            ).toPrecision(3),
      z: 7.5,
    },
  ]
  const dataPe = [
    {
      label: 'BE',
      x: breakEven0 == 0 && breakEven1 != 0 ? breakEven1 : breakEven0 != 0 ? breakEven0 : Pa,
      y: 0,
      z: 7.5,
    },
    {
      label: 'BE',
      x: breakEven1 == 0 && breakEven0 != 0 ? breakEven0 : breakEven1 < 9 * Pb ? breakEven1 : Pb,
      y: 0,
      z: 7.5,
    },
  ]
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
  const onRadioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setradioState(e.currentTarget.value)
  }
  const shortOps =
    Math.abs(Math.abs(startRatio - 0.5) - 0.5) < 0.01 // if position started OTM
      ? [
          { view: '0%', value: '0', checked: true },
          { view: '100%', value: '1', checked: false },
        ]
      : [
          { view: '0%', value: '0', checked: true },
          { view: (100 * startRatio).toFixed(0) + '%', value: startRatio.toString(), checked: false },
          { view: '100%', value: '1', checked: false },
        ]

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
                Volatility: {(100 * volatility).toFixed(0)}%
              </RowFixed>
            </ResponsiveRow>
            <RowBetween></RowBetween>
          </AutoColumn>
          <Confetti start={Boolean(removed && profit > 0)} />
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
                      y1={-Math.max(...dataPayoffY) * 3}
                      y2={Math.abs(Math.max(...dataPayoffY)) * 2}
                      fillOpacity={0.15}
                      fill={inRange ? '#47b247' : '#cc333f'}
                    />
                    <Area type="basis" dataKey="y" stroke="#000" fill="url(#splitColor)" activeDot={false} />
                    <ReferenceLine y={Math.max(...dataPayoffY)} stroke="#000" strokeDasharray="1 4" />
                    <ReferenceLine y={0} stroke="#000" />
                    <Scatter data={dataPc}>
                      <LabelList
                        position="insideBottomRight"
                        offset="10"
                        dataKey="label"
                        style={{ fontSize: '12px' }}
                      />
                    </Scatter>
                    <Scatter data={removed ? undefined : dataPe} shape="cross">
                      <LabelList
                        position="insideBottomRight"
                        offset="10"
                        dataKey="label"
                        style={{ fontSize: '12px' }}
                      />
                    </Scatter>
                    <Scatter line={{ stroke: '#000', strokeWidth: 1.5 }} data={dataPayoff} dataKey="x" />
                    <Tooltip
                      labelFormatter={(t) => ' '}
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
                      y1={removed ? -1 : -Math.abs(Math.min(...dataPayoffY)) * 1}
                      y2={removed ? 1 : -Math.abs(Math.min(...dataPayoffY)) * 0.8}
                      fillOpacity={100}
                      fill={'#fff'}
                      label={removed ? 'Profit: ' + profit.toPrecision(6) + ' USD' : profit.toPrecision(6)}
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
                      ticks={[
                        Pa.toPrecision(3),
                        Pc.toPrecision(3),
                        Pb.toPrecision(3),
                        Number(breakEven0).toPrecision(3),
                        Number(breakEven1).toPrecision(3),
                      ]}
                      domain={[Math.min(Pa / r ** 2, Pc / r ** 2), Math.max(Pb * r ** 1.5, Pc * r ** 1.5)]}
                      type="number"
                      label={{ value: 'Price', position: 'insideBottomRight', offset: 0 }}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      allowDecimals={false}
                      interval={0}
                      allowDataOverflow={true}
                      ticks={[0, dataPc[0].y, Math.max(...dataPayoffY)]}
                      dataKey="y"
                      domain={[
                        removed ? -1 : -Math.max(...dataPayoffY) * 3,
                        removed ? 1 : Math.max(...dataPayoffY) * 2,
                      ]}
                      label={{ value: 'Profit/Loss', angle: -90, position: 'insideLeft', offset: 5 }}
                    />
                    <ZAxis type="number" dataKey="z" range={[1, 100]} />
                  </ComposedChart>
                  <div>Hedge Amount:</div>
                  <div>
                    {shortOps.map(({ view: title, value: shortAmt }: any) => {
                      return (
                        <>
                          <input
                            type="radio"
                            value={shortAmt}
                            name={shortAmt}
                            checked={shortAmt == radioState}
                            onChange={(e) => onRadioChange(e)}
                          />
                          {title}
                        </>
                      )
                    })}
                  </div>{' '}
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
                        <ButtonConfirmed
                          width="fit-content"
                          padding="6px 8px"
                          confirmed={true}
                          style={{ marginLeft: '24px', marginRight: '0px' }}
                        >
                          <Trans>Check fees</Trans>
                        </ButtonConfirmed>
                      </Trans>
                    </Label>
                    {fiatValueOfFees?.greaterThan(new Fraction(1, 10000)) ? (
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
                        <Trans>{(feeVal0 + Pc * feeVal1).toPrecision(3)}</Trans>
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
                          <TYPE.main>
                            {feeValueUpper ? formatCurrencyAmount(feeValueUpper, 4) : feeVal0.toPrecision(3)}
                          </TYPE.main>
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
                          <TYPE.main>
                            {feeValueLower ? formatCurrencyAmount(feeValueLower, 4) : feeVal1.toPrecision(3)}
                          </TYPE.main>
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
          <DarkCard style={{ marginLeft: '0px' }} padding="15px" width="100%">
            <ResponsiveRow>
              <Label display="flex" style={{ marginRight: '12px', marginBottom: '12px' }}>
                <Trans>Options stats</Trans>
              </Label>
            </ResponsiveRow>
            <div style={{ cursor: 'pointer' }}>
              <Collapsible trigger="+ Click to expand" triggerWhenOpen="">
                <LightCard style={{ marginLeft: '0px' }} padding="10px" width="100%">
                  <ResponsiveRow>
                    <RowFixed>
                      <Trans>
                        <b>Volatility:</b>
                        {'\xa0' + (volatility * 100).toFixed(0)}%
                      </Trans>
                    </RowFixed>
                    <RowFixed>
                      <Trans>
                        <b>Expected Return: </b>{' '}
                        <TYPE.main color={returnColor}>
                          {'\xa0' + expectedReturnsUSD.toFixed(2)}$ ({(100 * expectedReturns).toFixed(2)}%)
                        </TYPE.main>
                      </Trans>
                    </RowFixed>
                    <RowFixed>
                      <b>dte: </b> {'\xa0' + (dte * 365).toFixed(1)}d
                    </RowFixed>
                    <RowFixed>
                      <b>delta: </b> {'\xa0' + (delta * 100).toFixed(0)}
                    </RowFixed>
                    <RowFixed>
                      <b>28d PoP: </b> {'\xa0' + (PoP * 100).toFixed(0)}%
                    </RowFixed>
                  </ResponsiveRow>
                </LightCard>
                <LightCard>
                  <ResponsiveRow>
                    <RowFixed>
                      <ComposedChart width={700} height={200} data={dayData1}>
                        <XAxis
                          dataKey="date"
                          ticks={[startDate - (startDate % 86400)]}
                          reversed={true}
                          allowDataOverflow={true}
                        />
                        <YAxis dataKey="price" domain={[0, Pb + Pa]} />
                        <Line data={dayData1} dataKey="price" dot={false} color="#56B2A4" />
                        <ReferenceArea
                          x1={startDate - (startDate % 86400)}
                          x2={endDate}
                          y1={Pa}
                          y2={Pb}
                          fillOpacity={0.15}
                          fill={'#47b247'}
                        />
                        <ReferenceLine x={startDate - (startDate % 86400)} stroke="#cc333f" />
                        <ReferenceLine y={Pa} stroke="#000" strokeDasharray="3 5" />
                        <ReferenceLine y={Pb} stroke="#000" strokeDasharray="3 5" />
                        <Tooltip labelFormatter={(t) => new Date(t * 1000).toLocaleDateString('en-CA')} />
                      </ComposedChart>
                    </RowFixed>
                  </ResponsiveRow>
                </LightCard>
              </Collapsible>
            </div>
          </DarkCard>
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
                tokenId={Number(tokenId)}
                chainId={chainId}
                amountDepositedUSD={amountDepositedUSD}
                amountCollectedUSD={amountCollectedUSD}
              />
            </AutoColumn>
          </DarkCard>
        </AutoColumn>
      </PageWrapper>
      <SwitchLocaleLink />
    </>
  )
}
