import { BigNumber } from '@ethersproject/bignumber'
import { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import { Pool } from '@uniswap/v3-sdk'
import { ZERO_ADDRESS } from 'constants/misc'
import { useEffect, useState } from 'react'
import { useBlockNumber } from 'state/application/hooks'
import { unwrappedToken } from 'utils/unwrappedToken'

import { useV3NFTPositionManagerContract } from './useContract'

const MAX_UINT128 = BigNumber.from(2).pow(128).sub(1)

// compute current + counterfactual fees for a v3 position
export function useV3PositionFees(
  pool?: Pool,
  tokenId?: BigNumber,
  asWETH = false
): [CurrencyAmount<Currency>, CurrencyAmount<Currency>] | [undefined, undefined] {
  const positionManager = useV3NFTPositionManagerContract(false)

  const tokenIdHexString = tokenId?.toHexString()
  const latestBlockNumber = useBlockNumber()

  // TODO find a way to get this into multicall
  // latestBlockNumber is included to ensure data stays up-to-date every block
  const [amounts, setAmounts] = useState<[BigNumber, BigNumber]>()
  useEffect(() => {
    let stale = false

    if (positionManager && tokenIdHexString && typeof latestBlockNumber === 'number') {
      positionManager.callStatic
        .collect(
          {
            tokenId: tokenIdHexString,
            recipient: ZERO_ADDRESS, // some tokens might fail if transferred to address(0)
            amount0Max: MAX_UINT128,
            amount1Max: MAX_UINT128,
          },
          { from: ZERO_ADDRESS } // need to simulate the call as the owner
        )
        .then((results) => {
          if (!stale) setAmounts([results.amount0, results.amount1])
        })
    }

    return () => {
      stale = true
    }
  }, [positionManager, tokenIdHexString, latestBlockNumber])

  if (pool && amounts && tokenId) {
    const fees0 = CurrencyAmount.fromRawAmount(
      !asWETH ? unwrappedToken(pool.token0) : pool.token0,
      amounts[0].toString()
    )
    const fees1 = CurrencyAmount.fromRawAmount(
      !asWETH ? unwrappedToken(pool.token1) : pool.token1,
      amounts[1].toString()
    )
    localStorage.setItem(tokenId.toString(), JSON.stringify([fees0.toSignificant(5), fees1.toSignificant(5)]))
    return [fees0, fees1]
  } else {
    return [undefined, undefined]
  }
}
