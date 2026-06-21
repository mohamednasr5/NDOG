import { db } from "@/lib/db"
import { NextResponse } from "next/server"

const STAKING_PLANS = {
  "7_days": { apr: 0.05, durationDays: 7, minStake: 100 },
  "30_days": { apr: 0.1, durationDays: 30, minStake: 500 },
  "90_days": { apr: 0.18, durationDays: 90, minStake: 1000 },
  "180_days": { apr: 0.25, durationDays: 180, minStake: 2000 },
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")

  if (!userId) {
    return NextResponse.json({ plans: STAKING_PLANS })
  }

  try {
    const contracts = await db.stakingContract.findMany({
      where: { userId },
      orderBy: { startDate: "desc" },
    })
    return NextResponse.json({ plans: STAKING_PLANS, contracts })
  } catch (error) {
    console.error("Staking error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { userId, planId, amount } = await req.json()
    if (!userId || !planId || !amount) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 })
    }

    const plan = STAKING_PLANS[planId as keyof typeof STAKING_PLANS]
    if (!plan) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 })
    }
    if (amount < plan.minStake) {
      return NextResponse.json({ error: `Minimum stake: ${plan.minStake}` }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user || user.balance < amount) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 })
    }

    const startDate = new Date()
    const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000)

    // Deduct balance
    await db.user.update({
      where: { id: userId },
      data: { balance: { decrement: amount } },
    })

    // Create staking contract
    const contract = await db.stakingContract.create({
      data: {
        userId,
        amount,
        planId,
        startDate,
        endDate,
        apr: plan.apr,
        status: "active",
      },
    })

    await db.transaction.create({
      data: {
        userId,
        type: "stake",
        amount: -amount,
        description: `Staked ${amount} NDOG for ${plan.durationDays} days`,
      },
    })

    return NextResponse.json({ success: true, contract })
  } catch (error) {
    console.error("Staking error:", error)
    return NextResponse.json({ error: "Staking failed" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const { contractId, action } = await req.json()
    if (!contractId) {
      return NextResponse.json({ error: "Missing contractId" }, { status: 400 })
    }

    const contract = await db.stakingContract.findUnique({ where: { id: contractId } })
    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 })
    }

    if (action === "claim") {
      const now = new Date()
      if (now < contract.endDate) {
        return NextResponse.json({ error: "Not yet matured" }, { status: 400 })
      }

      const earnedRewards = Math.round(contract.amount * contract.apr * 100) / 100
      const totalReturn = contract.amount + earnedRewards

      await db.stakingContract.update({
        where: { id: contractId },
        data: { status: "claimed", earnedRewards },
      })

      await db.user.update({
        where: { id: contract.userId },
        data: { balance: { increment: totalReturn } },
      })

      await db.transaction.create({
        data: {
          userId: contract.userId,
          type: "unstake",
          amount: totalReturn,
          description: `Unstaked ${contract.amount} + ${earnedRewards} rewards`,
        },
      })

      return NextResponse.json({ success: true, totalReturn, earnedRewards })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("Staking claim error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
