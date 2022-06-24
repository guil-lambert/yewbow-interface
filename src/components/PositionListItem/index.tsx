import { Trans } from '@lingui/macro'
import { Percent, Price, Token } from '@uniswap/sdk-core'
import { Position } from '@uniswap/v3-sdk'
import RangeBadge from 'components/Badge/RangeBadge'
import DoubleCurrencyLogo from 'components/DoubleLogo'
import Loader from 'components/Loader'
import { RowBetween } from 'components/Row'
import { useToken } from 'hooks/Tokens'
import useIsTickAtLimit from 'hooks/useIsTickAtLimit'
import { usePool } from 'hooks/usePools'
import { useV3PositionFees } from 'hooks/useV3PositionFees'
import numbro from 'numbro'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bound } from 'state/mint/v3/actions'
import styled from 'styled-components/macro'
import { MEDIA_WIDTHS, TYPE } from 'theme'
import { PositionDetails } from 'types/position'
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

// responsive text
export const Label = styled(TYPE.label)<{ end?: number }>`
  display: flex;
  font-size: 16px;
  font-weight: 400;
  justify-content: ${({ end }) => (end ? 'flex-end' : 'flex-start')};
  align-items: center;
  font-variant-numeric: tabular-nums;
  @media screen and (max-width: 640px) {
    font-size: 14px;
  }
`

const LinkRow = styled(Link)`
  align-items: center;
  border-radius: 7px;
  cursor: pointer;
  user-select: none;
  display: grid;
  grid-gap: 1em;
  align-items: center;

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

const PrimaryPositionIdData = styled.div`
  display: grid;
  grid-gap: 3em;
  align-items: center;
  grid-template-columns: 0.5fr 1fr 0.5fr 300px 2.5fr 2fr 2fr 2fr 2fr 2fr;
  > * {
    margin-right: 0px;
  }
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

  const currentPrice = pool ? 1.0001 ** pool.tickCurrent * 10 ** (pool.token0.decimals - pool.token1.decimals) : 1
  const formattedPrice = currentPrice ? Math.max(currentPrice, 1 / currentPrice) : 1
  const lowPrice = formatTickPrice(priceLower, tickAtLimit, Bound.UPPER)
  const highPrice = formatTickPrice(priceUpper, tickAtLimit, Bound.UPPER)

  //const below = formattedPrice ? formatAmount(formattedPrice) < lowPrice : undefined
  //const above = formattedPrice ? formatAmount(formattedPrice) >= highPrice : undefined

  const removed = liquidity?.eq(0)
  const fg =
    feeValue0 && feeValue1
      ? feeValue1.toSignificant(2) < feeValue0.toSignificant(2)
        ? feeValue1.multiply(2)
        : feeValue0.multiply(2)
      : 0

  //const outOfRange: boolean = pool ? pool.tickCurrent > tickLower || pool.tickCurrent <= tickUpper : false
  const positionSummaryLink = '/pool/' + positionDetails.tokenId
  const Pa = lowPrice < highPrice ? parseFloat(lowPrice) : parseFloat(highPrice)
  const Pb = lowPrice < highPrice ? parseFloat(highPrice) : parseFloat(lowPrice)
  const Pc = formattedPrice
  const Plower =
    !isNaN(Pa) && !isNaN(Pb)
      ? Math.min(Math.max(Pa, 1 / Pa), Math.max(Pb, 1 / Pb))
      : Math.min(Math.max(Pc, 1 / Pc), Math.max(Pc, 1 / Pc)) / 1.5
  const Pupper =
    !isNaN(Pa) && !isNaN(Pb)
      ? Math.max(Math.max(Pa, 1 / Pa), Math.max(Pb, 1 / Pb))
      : Math.min(Math.max(Pc, 1 / Pc), Math.max(Pc, 1 / Pc)) * 1.5
  const strike = (Pupper * Plower) ** 0.5
  const r = (Pupper / Plower) ** 0.5
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

  const positionValue = position
    ? position.pool.token0.address == WETH9_EXTENDED[1].address
      ? (parseFloat(position.amount0.toFixed(6)) + parseFloat(position.amount1.toFixed(6)) / currentPrice).toFixed(2)
      : (parseFloat(position.amount1.toFixed(6)) + parseFloat(position.amount0.toFixed(6)) * currentPrice).toFixed(2)
    : '1'
  return (
    <LinkRow to={positionSummaryLink}>
      <RowBetween>
        <PrimaryPositionIdData>
          <Label end={1} fontWeight={400}>
            <DoubleCurrencyLogo currency0={currencyBase} currency1={currencyQuote} size={18} margin />
          </Label>
          <Label end={1} fontWeight={400}>
            &nbsp;{currencyQuote?.symbol}&nbsp;/&nbsp;{currencyBase?.symbol}
          </Label>
          <Label end={1} fontWeight={400}>
            {new Percent(feeAmount, 1_000_000).toSignificant()}%
          </Label>
          <Label>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20">
              <g fill="#dedede">
                <rect x="0" y="7" width="100%" height="3" />
              </g>
              <g fill={Pc < Pupper && Pc > Plower ? '#47b247' : Pc < Plower ? '#4682b4' : '#cc333f'}>
                <rect
                  x={
                    1.5 * Pc < 1.1 * Pupper
                      ? 50 - (100 / (3 * Pupper - 2 * Pc)) * (Pupper - Pc)
                      : Pc / 2 > Plower / 1.1
                      ? 50 - (100 / (2 * Pc - (2 * Plower) / 1.5)) * (Pupper - Pc)
                      : 150 - (100 / Pc) * Pupper
                  }
                  y="7"
                  width="100%"
                  height="3"
                />
              </g>
              <g fill="#dedede">
                <rect
                  x={
                    1.5 * Pc < 1.1 * Pupper
                      ? 50 - (100 / (3 * Pupper - 2 * Pc)) * (Plower - Pc)
                      : Pc / 2 > Plower / 1.1
                      ? 50 - (100 / (2 * Pc - (2 * Plower) / 1.5)) * (Plower - Pc)
                      : 150 - (100 / Pc) * Plower
                  }
                  y="7"
                  width="100%"
                  height="3"
                />
              </g>
              <line
                x1={
                  1.5 * Pc < 1.1 * Pupper
                    ? 50 - (100 / (3 * Pupper - 2 * Pc)) * (Plower - Pc)
                    : Pc / 2 > Plower / 1.1
                    ? 50 - (100 / (2 * Pc - (2 * Plower) / 1.5)) * (Plower - Pc)
                    : 150 - (100 / Pc) * Plower
                }
                x2={
                  1.5 * Pc < 1.1 * Pupper
                    ? 50 - (100 / (3 * Pupper - 2 * Pc)) * (Plower - Pc)
                    : Pc / 2 > Plower / 1.1
                    ? 50 - (100 / (2 * Pc - (2 * Plower) / 1.5)) * (Plower - Pc)
                    : 150 - (100 / Pc) * Plower
                }
                y1="5"
                y2="12"
                stroke="#231f20"
                strokeWidth="0.5"
                strokeDasharray="0.5"
              />
              <text
                x={
                  1.5 * Pc < 1.1 * Pupper
                    ? 50 - (100 / (3 * Pupper - 2 * Pc)) * (Plower - Pc) - 2
                    : Pc / 2 > Plower / 1.1
                    ? 50 - (100 / (2 * Pc - (2 * Plower) / 1.5)) * (Plower - Pc) - 2
                    : 150 - (100 / Pc) * Plower - 2
                }
                y="18"
                fontSize="3"
              >
                Pb
              </text>
              <line
                x1={
                  1.5 * Pc < 1.1 * Pupper
                    ? 50 - (100 / (3 * Pupper - 2 * Pc)) * (strike - Pc)
                    : Pc / 2 > Plower / 1.1
                    ? 50 - (100 / (2 * Pc - (2 * Plower) / 1.5)) * (strike - Pc)
                    : 150 - (100 / Pc) * strike
                }
                x2={
                  1.5 * Pc < 1.1 * Pupper
                    ? 50 - (100 / (3 * Pupper - 2 * Pc)) * (strike - Pc)
                    : Pc / 2 > Plower / 1.1
                    ? 50 - (100 / (2 * Pc - (2 * Plower) / 1.5)) * (strike - Pc)
                    : 150 - (100 / Pc) * strike
                }
                y1="5"
                y2="12"
                stroke="#231f20"
                strokeWidth="0.5"
                strokeDasharray="0.5"
              />
              <text
                x={
                  1.5 * Pc < 1.1 * Pupper
                    ? 50 - (100 / (3 * Pupper - 2 * Pc)) * (strike - Pc) - 1
                    : Pc / 2 > Plower / 1.1
                    ? 50 - (100 / (2 * Pc - (2 * Plower) / 1.5)) * (strike - Pc) - 1
                    : 150 - (100 / Pc) * strike - 1
                }
                y="18"
                fontSize="3"
              >
                K
              </text>
              <line
                x1={(100 / Pc) * Pc - 50}
                x2={(100 / Pc) * Pc - 50}
                y1="5"
                y2="12"
                stroke="#231f20"
                strokeWidth="0.5"
              />
              <text x={(100 / Pc) * Pc - 50 - 1} y="3" fontSize="3">
                S
              </text>
              <line
                x1={
                  1.5 * Pc < 1.1 * Pupper
                    ? 50 - (100 / (3 * Pupper - 2 * Pc)) * (Pupper - Pc)
                    : Pc / 2 > Plower / 1.1
                    ? 50 - (100 / (2 * Pc - (2 * Plower) / 1.5)) * (Pupper - Pc)
                    : 150 - (100 / Pc) * Pupper
                }
                x2={
                  1.5 * Pc < 1.1 * Pupper
                    ? 50 - (100 / (3 * Pupper - 2 * Pc)) * (Pupper - Pc)
                    : Pc / 2 > Plower / 1.1
                    ? 50 - (100 / (2 * Pc - (2 * Plower) / 1.5)) * (Pupper - Pc)
                    : 150 - (100 / Pc) * Pupper
                }
                y1="5"
                y2="12"
                stroke="#231f20"
                strokeWidth="0.5"
                strokeDasharray="0.5"
              />
              <text
                x={
                  1.5 * Pc < 1.1 * Pupper
                    ? 50 - (100 / (3 * Pupper - 2 * Pc)) * (Pupper - Pc) - 2
                    : Pc / 2 > Plower / 1.1
                    ? 50 - (100 / (2 * Pc - (2 * Plower) / 1.5)) * (Pupper - Pc) - 2
                    : 150 - (100 / Pc) * Pupper - 2
                }
                y="18"
                fontSize="3"
              >
                Pa
              </text>
            </svg>
          </Label>
          <Label end={1} fontWeight={400}>
            Value:
            <br />
            {''}
            {positionValue} ETH
          </Label>
          <Label end={1} fontWeight={400}>
            Uncollected fees:
            <br />
            {''}
            {''} {fg ? fg.toFixed(2) : '-'}
            {''} ETH
          </Label>
          <Label end={1} fontWeight={400}>
            Delta:{(delta * 100).toFixed(0)}
          </Label>
          <Label end={1} fontWeight={400}>
            Returns:
            {fg ? ((parseFloat(fg.toFixed(6)) * 100) / parseFloat(positionValue)).toFixed(2) : '-'}%
          </Label>
          <Label>{''}</Label>
          <Label>
            <RangeBadge
              removed={removed}
              inRange={delta > 0 && delta < 1}
              belowRange={delta == 1}
              aboveRange={delta == 0}
            />
          </Label>
        </PrimaryPositionIdData>
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
