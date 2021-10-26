import { Trans } from '@lingui/macro'
import Badge, { BadgeVariant } from 'components/Badge'
import { AlertCircle } from 'react-feather'
import styled from 'styled-components/macro'

import { MouseoverTooltip } from '../../components/Tooltip'

const BadgeWrapper = styled.div`
  font-size: 14px;
  display: flex;
  justify-content: flex-end;
`

const BadgeText = styled.div`
  font-weight: 500;
  font-size: 14px;
`

const ActiveDot = styled.span`
  background-color: ${({ theme }) => theme.success};
  border-radius: 50%;
  height: 8px;
  width: 8px;
  margin-right: 4px;
`

export default function RangeBadge({
  removed,
  inRange,
  aboveRange,
  belowRange,
}: {
  removed: boolean | undefined
  inRange: boolean | undefined
  aboveRange: boolean | undefined
  belowRange: boolean | undefined
}) {
  return (
    <BadgeWrapper>
      {removed ? (
        <MouseoverTooltip text={<Trans>Your position has 0 liquidity, and is not earning fees.</Trans>}>
          <Badge variant={BadgeVariant.DEFAULT}>
            <AlertCircle width={14} height={14} />
            &nbsp;
            <BadgeText>
              <Trans>Closed</Trans>
            </BadgeText>
          </Badge>
        </MouseoverTooltip>
      ) : inRange ? (
        <MouseoverTooltip
          text={
            <Trans>
              The price of this pool is inside of your selected range. Your position is currently earning fees.
            </Trans>
          }
        >
          <Badge variant={BadgeVariant.DEFAULT}>
            <ActiveDot />
            &nbsp;
            <BadgeText>
              <Trans>In range</Trans>
            </BadgeText>
          </Badge>
        </MouseoverTooltip>
      ) : aboveRange ? (
        <MouseoverTooltip
          text={
            <Trans>
              The price of this pool is above your selected range. Your position is not currently earning fees and may
              be losing value.
            </Trans>
          }
        >
          <Badge variant={BadgeVariant.WARNING_OUTLINE}>
            <AlertCircle width={14} height={14} /> &nbsp;
            <BadgeText>
              <Trans>Above range</Trans>
            </BadgeText>
          </Badge>
        </MouseoverTooltip>
      ) : belowRange ? (
        <MouseoverTooltip
          text={
            <Trans>
              The price of this pool is below your selected range. Your position is not earning fees but may have
              realized a profit.
            </Trans>
          }
        >
          <Badge variant={BadgeVariant.WARNING}>
            <AlertCircle width={14} height={14} /> &nbsp;
            <BadgeText>
              <Trans>Below range</Trans>
            </BadgeText>
          </Badge>
        </MouseoverTooltip>
      ) : (
        <MouseoverTooltip
          text={
            <Trans>
              The price of this pool is inside of your selected range. Your position is currently earning fees.
            </Trans>
          }
        >
          <Badge variant={BadgeVariant.DEFAULT}>
            <ActiveDot />
            &nbsp;
            <BadgeText>
              <Trans>In range</Trans>
            </BadgeText>
          </Badge>
        </MouseoverTooltip>
      )}
    </BadgeWrapper>
  )
}
