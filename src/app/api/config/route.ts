import { db } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const configs = await db.siteConfig.findMany()
    const configMap: Record<string, string> = {}
    configs.forEach((c) => { configMap[c.key] = c.value })

    const defaultConfig = {
      platform: { name: "NileDogs", symbol: "NDOG", version: "2.0.5", maintenanceMode: false, launchDate: "2028-01-01T00:00:00Z" },
      mining: { baseReward: 10, maxDailyClaims: 1 },
      referral: { enabled: true, tiers: { L1: 50, L2: 20, L3: 10 } },
      staking: { enabled: true },
      games: {
        spinWheel: { cooldownHours: 24, enabled: true, prizes: [5, 10, 15, 20, 25, 50, 75, 100] },
        luckyBox: { cooldownHours: 6, enabled: true, maxPrize: 100, minPrize: 5 },
        scratchCard: { cooldownHours: 12, enabled: true, maxPrize: 200 },
      },
      tokenomics: {
        totalSupply: 1000000000,
        distribution: {
          community: { percentage: 60, amount: 600000000 },
          team: { percentage: 15, amount: 150000000 },
          liquidity: { percentage: 10, amount: 100000000 },
          partnerships: { percentage: 10, amount: 100000000 },
          reserve: { percentage: 5, amount: 50000000 },
        },
      },
      airdrop: {
        enabled: true,
        currentRound: 1,
        totalPool: 1000000,
      },
      antiFraud: { maxClaimsPerDay: 1, maxAccountsPerDevice: 2 },
    }

    return NextResponse.json(defaultConfig)
  } catch (error) {
    console.error("Config error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
