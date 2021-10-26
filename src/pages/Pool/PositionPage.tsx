import { BigNumber } from '@ethersproject/bignumber'
import { TransactionResponse } from '@ethersproject/providers'
import { Trans } from '@lingui/macro'
import { Currency, CurrencyAmount, Fraction, Percent, Price, Token } from '@uniswap/sdk-core'
import { NonfungiblePositionManager, Pool, Position } from '@uniswap/v3-sdk'
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
import { useToken } from 'hooks/Tokens'
import { useV3NFTPositionManagerContract } from 'hooks/useContract'
import useIsTickAtLimit from 'hooks/useIsTickAtLimit'
import { PoolState, usePool } from 'hooks/usePools'
import useUSDCPrice from 'hooks/useUSDCPrice'
import { useV3PositionFees } from 'hooks/useV3PositionFees'
import { useV3PositionFromTokenId } from 'hooks/useV3Positions'
import { useActiveWeb3React } from 'hooks/web3'
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
import { WETH9_EXTENDED } from '../../constants/tokens'
import { usePositionTokenURI } from '../../hooks/usePositionTokenURI'
import useTheme from '../../hooks/useTheme'
import { TransactionType } from '../../state/transactions/actions'
import { calculateGasMargin } from '../../utils/calculateGasMargin'
import { ExplorerDataType, getExplorerLink } from '../../utils/getExplorerLink'
import { LoadingRows } from './styleds'

const PageWrapper = styled.div`
  min-width: 800px;
  max-width: 960px;

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
}: {
  inverted?: boolean
  pool?: Pool | null
  currencyQuote?: Currency
  currencyBase?: Currency
}) {
  if (!pool || !currencyQuote || !currencyBase) {
    return null
  }

  return (
    <LightCard padding="12px ">
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

  const removed = liquidity?.eq(0)

  const token0 = useToken(token0Address)
  const token1 = useToken(token1Address)

  const metadata = usePositionTokenURI(parsedTokenId)

  const currency0 = token0 ? unwrappedToken(token0) : undefined
  const currency1 = token1 ? unwrappedToken(token1) : undefined

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

  const addTransaction = useTransactionAdder()
  const positionManager = useV3NFTPositionManagerContract()
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

  const owner = useSingleCallResult(!!tokenId ? positionManager : null, 'ownerOf', [tokenId]).result?.[0]
  const ownsNFT = owner === account || positionDetails?.operator === account

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

  const fees = fiatValueOfFees ? parseFloat(fiatValueOfFees.toFixed(2)) : 0
  const liqFiatValue = fiatValueOfLiquidity ? parseFloat(fiatValueOfLiquidity.toFixed(2)) : 0
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
  const feeValueTotal =
    feeValue0 && feeValue1 && chainId
      ? token1Address == WETH9_EXTENDED[chainId]?.address
        ? parseFloat(feeValue1.toFixed(6)) + parseFloat(feeValue0.toFixed(6)) * Pc
        : parseFloat(feeValue0.toFixed(6)) + parseFloat(feeValue1.toFixed(6)) * Pc
      : 0
  const strike = (Pb * Pa) ** 0.5
  const r = Pb > Pa ? (Pb / Pa) ** 0.5 : (Pa / Pb) ** 0.5
  const dp = Pb > Pa ? Pb - Pa : Pa - Pb
  const startPrice = Pa

  const dL = position
    ? Pc > Pa && Pc < Pb
      ? amtETH / (Pc ** 0.5 - Pa ** 0.5)
      : Pc < Pa
      ? amtTok / (Pa ** -0.5 - Pb ** -0.5)
      : amtETH / (Pb ** 0.5 - Pa ** 0.5)
    : 0
  const dE = (dL * (Pb ** 0.5 - Pa ** 0.5)) / (Pb * Pa) ** 0.5
  const Pe = startPrice - feeValueTotal / dE
  const Pmin =
    Pc < Pe
      ? Pc * 0.95
      : Pe < Pa - dp
      ? Pe * 0.95
      : Pc < Pa - dp
      ? Pc * 0.95
      : Pc > Pb + dp
      ? Pa * 0.95 - (Pc - Pb)
      : Pa * 0.95 - dp
  const Pmax = Pc > Pb + dp ? Pc * 1.05 : Pc < Pa - dp ? Pb * 1.05 + (Pa - Pc) : Pb * 1.05 + dp
  const baseValue = dE * startPrice
  const topFees = dE * strike + feeValueTotal - baseValue
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
  const data = [
    {
      x: Pmin,
      y: dE * Pmin + feeValueTotal - baseValue,
    },
    {
      x: Pa,
      y: dE * Pa + feeValueTotal - baseValue,
    },
    {
      x: Pa + (1 * dp) / 5,
      y:
        (dE * (2 * (strike * (Pa + (1 * dp) / 5) * r) ** 0.5 - strike - Pa - (1 * dp) / 5)) / (r - 1) +
        feeValueTotal -
        baseValue,
    },
    {
      x: Pa + (2 * dp) / 5,
      y:
        (dE * (2 * (strike * (Pa + (2 * dp) / 5) * r) ** 0.5 - strike - Pa - (2 * dp) / 5)) / (r - 1) +
        feeValueTotal -
        baseValue,
    },
    {
      x: Pa + (3 * dp) / 5,
      y:
        (dE * (2 * (strike * (Pa + (3 * dp) / 5) * r) ** 0.5 - strike - Pa - (3 * dp) / 5)) / (r - 1) +
        feeValueTotal -
        baseValue,
    },
    {
      x: Pa + (4 * dp) / 5,
      y:
        (dE * (2 * (strike * (Pa + (4 * dp) / 5) * r) ** 0.5 - strike - Pa - (4 * dp) / 5)) / (r - 1) +
        feeValueTotal -
        baseValue,
    },
    {
      x: Pa + (5 * dp) / 5,
      y:
        (dE * (2 * (strike * (Pa + (5 * dp) / 5) * r) ** 0.5 - strike - Pa - (5 * dp) / 5)) / (r - 1) +
        feeValueTotal -
        baseValue,
    },
    {
      x: Pmax,
      y: dE * strike + feeValueTotal - baseValue,
    },
  ]
  const dataPc = [
    {
      name: 'Current Price',
      x: Pc.toFixed(8),
      y:
        Pc < Pb && Pc > Pa
          ? ((dE * (2 * (strike * Pc * r) ** 0.5 - strike - Pc)) / (r - 1) + feeValueTotal - baseValue).toFixed(6)
          : Pc < Pa
          ? (dE * Pc + feeValueTotal - baseValue).toFixed(6)
          : (dE * strike + feeValueTotal - baseValue).toFixed(6),
    },
    {
      name: 'Break even',
      x: Pe.toFixed(8),
      y: 0,
    },
  ]
  const gradientOffset = () => {
    const dataMax = Math.max(...data.map((i) => i.y))
    const dataMin = Math.min(...data.map((i) => i.y))

    if (dataMax <= 0) {
      return 0
    }
    if (dataMin >= 0) {
      return 1
    }

    return dataMax / (dataMax - dataMin)
  }

  const off = gradientOffset()

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
                <Trans>← Back to Pools Overview</Trans>
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
              {ownsNFT && (
                <RowFixed>
                  {currency0 && currency1 && feeAmount && tokenId ? (
                    <ButtonGray
                      as={Link}
                      to={`/increase/${currencyId(currency0)}/${currencyId(currency1)}/${feeAmount}/${tokenId}`}
                      width="fit-content"
                      padding="6px 8px"
                      $borderRadius="4px"
                      style={{ marginRight: '8px' }}
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
                    >
                      <Trans>Remove Liquidity</Trans>
                    </ResponsiveButtonPrimary>
                  ) : null}
                </RowFixed>
              )}
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
                    data={data}
                    margin={{
                      top: 50,
                      right: 10,
                      left: 10,
                      bottom: 40,
                    }}
                  >
                    <XAxis
                      dataKey="x"
                      name="Price"
                      textAnchor="end"
                      interval={0}
                      tick={{ fontSize: 10, angle: -45 }}
                      ticks={[Pe.toFixed(5), Pa.toFixed(5), Pc.toFixed(5), Pb.toFixed(5)]}
                      domain={[Pmin, Pmax]}
                      type="number"
                      label={{ value: 'Price', position: 'insideBottomRight', offset: 0 }}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      interval={0}
                      ticks={[
                        0,
                        (
                          (dE * (2 * (strike * Math.min(Pc, Pb) * r) ** 0.5 - strike - Math.min(Pc, Pb))) / (r - 1) +
                          feeValueTotal -
                          baseValue
                        ).toFixed(3),
                        (dE * strike + feeValueTotal - baseValue).toFixed(3),
                      ]}
                      dataKey="y"
                      domain={[dE * Pmin - baseValue, dE * strike * 1.1 + feeValueTotal - baseValue]}
                      label={{ value: 'PL', angle: -90, position: 'insideTopLeft', offset: 15 }}
                    />
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
                      y2={dE * strike * 1.1 + feeValueTotal - baseValue}
                      fillOpacity={0}
                      label={'100% ' + tokenSymbol}
                    />
                    <ReferenceArea
                      x1={Pb}
                      x2={Pmax}
                      y1={dE * strike + feeValueTotal - baseValue}
                      y2={dE * strike * 1.1 + feeValueTotal - baseValue}
                      fillOpacity={0}
                      label={'100% ETH'}
                    />
                    <ReferenceArea
                      x1={Pa}
                      x2={Pb}
                      y1={dE * Pmin - baseValue}
                      y2={dE * strike * 1.1 + feeValueTotal - baseValue}
                      fillOpacity={0.5}
                    />
                    <Area type="monotone" dataKey="y" name="PL" stroke="#000" fill="url(#splitColor)" />
                    <ReferenceLine y={dE * strike + feeValueTotal - baseValue} stroke="#000" strokeDasharray="1 4" />
                    <ReferenceLine y={0} stroke="#000" />
                    <Scatter data={dataPc} dataKey="name" />
                    <Tooltip />
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
                    <Trans>ETH {LiqValueTotal.toFixed(6)}</Trans>
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
                </AutoColumn>
              </DarkCard>
              <DarkCard>
                <AutoColumn gap="md" style={{ width: '100%' }}>
                  <AutoColumn gap="md">
                    <RowBetween style={{ alignItems: 'flex-start' }}>
                      <AutoColumn gap="md">
                        <Label>
                          <Trans>Unclaimed fees</Trans>
                        </Label>
                        <Trans>ETH {feeValueTotal.toFixed(6)}</Trans>
                      </AutoColumn>
                      {ownsNFT && (feeValue0?.greaterThan(0) || feeValue1?.greaterThan(0) || !!collectMigrationHash) ? (
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
                    </RowBetween>
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
                          <Trans>Collect as WETH</Trans>
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
                  <ExtentsText>
                    <TYPE.small textAlign="center">{r.toFixed(5)}</TYPE.small>
                  </ExtentsText>
                  <DoubleArrow>⟷</DoubleArrow>
                  <ExtentsText>
                    <TYPE.small textAlign="center">{strike.toFixed(5)}</TYPE.small>
                  </ExtentsText>
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
              />
            </AutoColumn>
          </DarkCard>
        </AutoColumn>
      </PageWrapper>
      <SwitchLocaleLink />
    </>
  )
}
