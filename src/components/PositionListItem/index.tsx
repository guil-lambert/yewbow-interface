import { Trans } from '@lingui/macro'
import { Percent, Price, Token } from '@uniswap/sdk-core'
import { Position } from '@uniswap/v3-sdk'
import Badge from 'components/Badge'
import RangeBadge from 'components/Badge/RangeBadge'
import DoubleCurrencyLogo from 'components/DoubleLogo'
import FormattedCurrencyAmount from 'components/FormattedCurrencyAmount'
import HoverInlineText from 'components/HoverInlineText'
import Loader from 'components/Loader'
import { RowBetween } from 'components/Row'
import { useToken } from 'hooks/Tokens'
import useIsTickAtLimit from 'hooks/useIsTickAtLimit'
import { usePool } from 'hooks/usePools'
import { useV3PositionFees } from 'hooks/useV3PositionFees'
import { useV3Positions } from 'hooks/useV3Positions'
import numbro from 'numbro'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bound } from 'state/mint/v3/actions'
import styled from 'styled-components/macro'
import { HideSmall, MEDIA_WIDTHS, SmallOnly, TYPE } from 'theme'
import { PositionDetails } from 'types/position'
import { formatCurrencyAmount } from 'utils/formatCurrencyAmount'
import { formatTickPrice } from 'utils/formatTickPrice'
import { unwrappedToken } from 'utils/unwrappedToken'

import { DAI, USDC, USDT, WBTC, WETH9_EXTENDED } from '../../constants/tokens'

export const formatAmount = (num: number | undefined, digits = 2) => {
  if (num === 0) return '0'
  if (!num) return '-'
  if (num < 0.000001) {
    return '<0.000001'
  }
  return numbro(num).format({
    mantissa: num > 10000 ? 0 : num > 1000 ? 1 : num < 100 ? 3 : num < 10 ? 4 : digits,
    abbreviations: {
      million: 'M',
      billion: 'B',
    },
  })
}

const LinkRow = styled(Link)`
  align-items: center;
  border-radius: 7px;
  display: flex;
  cursor: pointer;
  user-select: none;
  display: flex;
  flex-direction: column;

  justify-content: space-between;
  color: ${({ theme }) => theme.text1};
  margin: 8px 0;
  padding: 16px;
  text-decoration: none;
  font-weight: 500;
  background-color: ${({ theme }) => theme.bg1};

  &:last-of-type {
    margin: 8px 0 0 0;
  }
  & > div:not(:first-child) {
    text-align: center;
  }
  :hover {
    background-color: ${({ theme }) => theme.bg6};
  }

  @media screen and (min-width: ${MEDIA_WIDTHS.upToSmall}px) {
    /* flex-direction: row; */
  }

  ${({ theme }) => theme.mediaWidth.upToSmall`
    flex-direction: column;
    row-gap: 12px;
  `};
`

const BadgeText = styled.div`
  font-weight: 500;
  font-size: 14px;
  ${({ theme }) => theme.mediaWidth.upToSmall`
    font-size: 12px;
  `};
`

const DataLineItem = styled.div`
  font-size: 14px;
`

const RangeLineItem = styled(DataLineItem)`
  display: flex;
  flex-direction: row;
  align-items: center;

  margin-top: 4px;
  width: 100%;

  ${({ theme }) => theme.mediaWidth.upToSmall`
  background-color: ${({ theme }) => theme.bg3};
    border-radius: 4px;
    padding: 8px 0;
`};
`

const DoubleArrow = styled.span`
  margin: 0 2px;
  color: ${({ theme }) => theme.text3};
  ${({ theme }) => theme.mediaWidth.upToSmall`
    margin: 4px;
    padding: 20px;
  `};
`

const RangeText = styled.span`
  /* background-color: ${({ theme }) => theme.bg2}; */
  padding: 0.25rem 0.5rem;
  border-radius: 2px;
`

const ExtentsText = styled.span`
  color: ${({ theme }) => theme.text3};
  font-size: 14px;
  margin-right: 4px;
  ${({ theme }) => theme.mediaWidth.upToSmall`
    display: none;
  `};
`

const PrimaryPositionIdData = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  > * {
    margin-right: 8px;
  }
`

const DataText = styled.div`
  font-weight: 600;
  font-size: 18px;

  ${({ theme }) => theme.mediaWidth.upToSmall`
    font-size: 14px;
  `};
`

interface PositionListItemProps {
  positionDetails: PositionDetails
}

export function getPriceOrderingFromPositionForUI(position?: Position): {
  priceLower?: Price<Token, Token>
  priceUpper?: Price<Token, Token>
  quote?: Token
  base?: Token
} {
  if (!position) {
    return {}
  }

  const token0 = position.amount0.currency
  const token1 = position.amount1.currency

  // if token0 is a dollar-stable asset, set it as the quote token
  const stables = [DAI, USDC, USDT]
  if (stables.some((stable) => stable.equals(token0))) {
    return {
      priceLower: position.token0PriceUpper.invert(),
      priceUpper: position.token0PriceLower.invert(),
      quote: token0,
      base: token1,
    }
  }

  // if token1 is an ETH-/BTC-stable asset, set it as the base token
  const bases = [...Object.values(WETH9_EXTENDED), WBTC]
  if (bases.some((base) => base.equals(token1))) {
    return {
      priceLower: position.token0PriceUpper.invert(),
      priceUpper: position.token0PriceLower.invert(),
      quote: token0,
      base: token1,
    }
  }

  // if both prices are below 1, invert
  if (position.token0PriceUpper.lessThan(1)) {
    return {
      priceLower: position.token0PriceUpper.invert(),
      priceUpper: position.token0PriceLower.invert(),
      quote: token0,
      base: token1,
    }
  }

  // otherwise, just return the default
  return {
    priceLower: position.token0PriceLower,
    priceUpper: position.token0PriceUpper,
    quote: token1,
    base: token0,
  }
}

export default function PositionListItem({ positionDetails }: PositionListItemProps) {
  const {
    token0: token0Address,
    token1: token1Address,
    fee: feeAmount,
    liquidity,
    tickLower,
    tickUpper,
  } = positionDetails

  const token0 = useToken(token0Address)
  const token1 = useToken(token1Address)

  const currency0 = token0 ? unwrappedToken(token0) : undefined
  const currency1 = token1 ? unwrappedToken(token1) : undefined

  // construct Position from details returned
  const [, pool] = usePool(currency0 ?? undefined, currency1 ?? undefined, feeAmount)

  const position = useMemo(() => {
    if (pool) {
      return new Position({ pool, liquidity: liquidity.toString(), tickLower, tickUpper })
    }
    return undefined
  }, [liquidity, pool, tickLower, tickUpper])

  const [feeValue0, feeValue1] = useV3PositionFees(pool ?? undefined, positionDetails?.tokenId, false)

  const tickAtLimit = useIsTickAtLimit(feeAmount, tickLower, tickUpper)

  // prices
  const { priceLower, priceUpper, quote, base } = getPriceOrderingFromPositionForUI(position)

  const currencyQuote = quote && unwrappedToken(quote)
  const currencyBase = base && unwrappedToken(base)

  // check if price is within range
  const below = pool && typeof tickLower === 'number' ? pool.tickCurrent < tickLower : undefined
  const above = pool && typeof tickUpper === 'number' ? pool.tickCurrent >= tickUpper : undefined
  const inRange: boolean = typeof below === 'boolean' && typeof above === 'boolean' ? !below && !above : false

  const currentPrice = pool ? 1.0001 ** pool.tickCurrent * 10 ** (pool.token0.decimals - pool.token1.decimals) : 1
  const formattedPrice = currentPrice ? Math.max(currentPrice, 1 / currentPrice) : 1
  const feeBase =
    currentPrice > 1
      ? formattedPrice == currentPrice
        ? currencyBase?.symbol
        : currencyQuote?.symbol
      : currencyBase?.symbol
  const lowPrice = formatTickPrice(priceLower, tickAtLimit, Bound.UPPER)
  const highPrice = formatTickPrice(priceUpper, tickAtLimit, Bound.UPPER)

  //const below = formattedPrice ? formatAmount(formattedPrice) < lowPrice : undefined
  //const above = formattedPrice ? formatAmount(formattedPrice) >= highPrice : undefined
  const insideRange = formattedPrice
    ? formatAmount(formattedPrice) > lowPrice && formatAmount(formattedPrice) <= highPrice
    : undefined

  const removed = liquidity?.eq(0)
  const inverted = token1 ? base?.equals(token1) : undefined
  const fg =
    feeValue0 && feeValue1
      ? feeValue1.toSignificant(2) < feeValue0.toSignificant(2)
        ? feeValue1.multiply(2)
        : feeValue0.multiply(2)
      : undefined

  //const outOfRange: boolean = pool ? pool.tickCurrent > tickLower || pool.tickCurrent <= tickUpper : false
  const positionSummaryLink = '/pool/' + positionDetails.tokenId
  const Pa = lowPrice < highPrice ? parseFloat(lowPrice) : parseFloat(highPrice)
  const Pb = lowPrice < highPrice ? parseFloat(highPrice) : parseFloat(lowPrice)
  const Plower = Math.min(Math.max(Pa, 1 / Pa), Math.max(Pb, 1 / Pb))
  const Pupper = Math.max(Math.max(Pa, 1 / Pa), Math.max(Pb, 1 / Pb))
  const Pc = formattedPrice
  const strike = (Pb * Pa) ** 0.5
  const r = Pb > Pa ? (Pb / Pa) ** 0.5 : (Pa / Pb) ** 0.5
  const delta = Pc < Pupper && Pc > Plower ? 1 - (((strike * r) / Pc) ** 0.5 - 1) / (r - 1) : Pc < Plower ? 0 : 1
  const decs0 = pool ? pool.token0.decimals : 0
  const decs1 = pool ? pool.token1.decimals : 0
  const yMax = liquidity
    ? Pc > Pb
      ? Math.abs(parseFloat(liquidity.toString()) * (Pb ** 0.5 - Pa ** 0.5)) / 10 ** (decs0 / 2 + decs1 / 2)
      : Pc > Pa
      ? Math.abs(parseFloat(liquidity.toString()) * (Pc ** 0.5 - Pa ** 0.5)) / 10 ** (decs0 / 2 + decs1 / 2)
      : 0
    : 0
  const xMax = liquidity
    ? Pc < Pa
      ? Math.abs(parseFloat(liquidity.toString()) * (Pa ** -0.5 - Pb ** -0.5)) / 10 ** (decs0 / 2 + decs1 / 2)
      : Pc < Pb
      ? Math.abs(parseFloat(liquidity.toString()) * (Pc ** -0.5 - Pb ** -0.5)) / 10 ** (decs0 / 2 + decs1 / 2)
      : 0
    : 0
  const positionValue = yMax / Pc + xMax > 0 ? yMax / Pc + xMax : 0
  const startValue = liquidity
    ? Math.abs(Pa * parseFloat(liquidity.toString()) * (Pb ** 0.5 - Pa ** 0.5)) / 10 ** (decs0 / 2 + decs1 / 2)
    : 0
  return (
    <LinkRow to={positionSummaryLink}>
      <RowBetween>
        <PrimaryPositionIdData>
          <DoubleCurrencyLogo currency0={currencyBase} currency1={currencyQuote} size={18} margin />
          <DataText>
            &nbsp;{currencyQuote?.symbol}&nbsp;/&nbsp;{currencyBase?.symbol}
          </DataText>
          <Badge>
            <BadgeText>
              <Trans>{new Percent(feeAmount, 1_000_000).toSignificant()}%</Trans>
            </BadgeText>
          </Badge>
          &nbsp;
          <RangeText>
            <Trans>
              {Pc > Pupper ? <TYPE.red>{formatAmount(1000 / formattedPrice)}</TYPE.red> : formatAmount(1000 / Pupper)}
            </Trans>
          </RangeText>{' '}
          <HideSmall>
            <DoubleArrow>{Pc > Pupper ? '..........' : '⟷'}</DoubleArrow>{' '}
          </HideSmall>
          <RangeText>
            <Trans>
              {Pc > Plower && Pc < Pupper ? (
                <TYPE.blue>{formatAmount(1000 / formattedPrice)}</TYPE.blue>
              ) : Pc < Plower ? (
                formatAmount(1000 / Plower)
              ) : (
                formatAmount(1000 / Pupper)
              )}
            </Trans>
          </RangeText>
          <HideSmall>
            <DoubleArrow>{Pc < Plower ? '..........' : '⟷'}</DoubleArrow>{' '}
          </HideSmall>
          <RangeText>
            <Trans>
              {Pc < Plower ? (
                <TYPE.green>{formatAmount(1000 / formattedPrice)}</TYPE.green>
              ) : (
                formatAmount(1000 / Plower)
              )}{' '}
              mETH
            </Trans>
          </RangeText>
        </PrimaryPositionIdData>
        <RangeText>
          <ExtentsText>
            <Trans>Uncollected fees:</Trans>
          </ExtentsText>
          <Trans>
            {fg?.toSignificant(3)} {''}ETH{' / '}
            {fg && yMax / Pc + xMax > 0 ? ((100 * parseFloat(fg.toSignificant(5))) / (yMax / Pc + xMax)).toFixed(1) : 0}
            %
          </Trans>
        </RangeText>
        <RangeText>
          <ExtentsText>
            <Trans>Delta:</Trans>
          </ExtentsText>
          <Trans>{(delta * 100).toFixed(0)}</Trans>
        </RangeText>
        <RangeText>
          <ExtentsText>
            <Trans>Returns</Trans>
          </ExtentsText>
          <Trans>
            {formattedPrice < Plower
              ? (100 * Pupper) / Plower - 100
              : ((100 * Pupper) / formattedPrice - 100).toFixed(0)}
            %
          </Trans>
        </RangeText>
        <RangeBadge
          removed={removed}
          inRange={delta > 0 && delta < 1}
          belowRange={delta == 1}
          aboveRange={delta == 0}
        />
      </RowBetween>
      {priceLower && priceUpper ? (
        <RowBetween>
          <RangeLineItem></RangeLineItem>
        </RowBetween>
      ) : (
        <Loader />
      )}
    </LinkRow>
  )
}
