import { db } from "@/lib/db"
import { NextResponse } from "next/server"

// VIP tier multipliers from config
const VIP_MULTIPLIERS: Record<string, number> = {
  bronze: 1,
  silver: 1.2,
  gold: 1.5,
  platinum: 2,
  diamond: 3,
}

const STREAK_MULTIPLIERS: Record<number, number> = {
  2: 1.2,
  3: 1.5,
  5: 1.8,
  7: 2,
  14: 2.5,
  30: 3,
}

const BASE_REWARD = 10

export async function POST(req: Request) {
  try {
    const { userId } = await req.json()
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }
    if (user.banned) {
      return NextResponse.json({ error: "Account is banned" }, { status: 403 })
    }

    // Check cooldown - 24 hours
    const now = new Date()
    if (user.lastClaimAt) {
      const lastClaim = new Date(user.lastClaimAt)
      const hoursSinceLastClaim = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60)
      if (hoursSinceLastClaim < 24) {
        const nextClaimTime = new Date(lastClaim.getTime() + 24 * 60 * 60 * 1000)
        return NextResponse.json({
          error: "Cooldown active",
          nextClaimAt: nextClaimTime.toISOString(),
          hoursRemaining: Math.ceil(24 - hoursSinceLastClaim),
        }, { status: 429 })
      }
    }

    // Check streak
    let newStreak = 1
    if (user.lastClaimAt) {
      const lastClaim = new Date(user.lastClaimAt)
      const daysSinceLastClaim = Math.floor(
        (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysSinceLastClaim <= 1) {
        newStreak = user.streak + 1
      } else if (daysSinceLastClaim > 2) {
        newStreak = 1
      } else {
        newStreak = user.streak
      }
    }

    // Calculate reward
    let multiplier = 1
    // VIP multiplier
    multiplier *= VIP_MULTIPLIERS[user.vipLevel] || 1
    // Streak multiplier
    for (const [days, mult] of Object.entries(STREAK_MULTIPLIERS)) {
      if (newStreak >= parseInt(days)) {
        multiplier = mult
      }
    }
    // Founder bonus
    if (user.founder) multiplier *= 1.5

    const reward = Math.round(BASE_REWARD * multiplier * 100) / 100

    // Update user
    const updatedUser = await db.user.update({
      where: { id: userId },
      data: {
        balance: { increment: reward },
        streak: newStreak,
        lastClaimAt: now,
        totalClaimed: { increment: reward },
      },
    })

    // Create claim record
    await db.claim.create({
      data: {
        userId,
        amount: reward,
      },
    })

    // Create transaction
    await db.transaction.create({
      data: {
        userId,
        type: "daily_claim",
        amount: reward,
        description: `Daily claim - Day ${newStreak} (x${multiplier})`,
      },
    })

    // Check milestone badges
    if (newStreak >= 7) {
      const existing7 = await db.userBadge.findFirst({
        where: { userId, badgeId: "badge_streak_7" },
      })
      if (!existing7) {
        await db.userBadge.create({
          data: { userId, badgeId: "badge_streak_7" },
        })
      }
    }
    if (newStreak >= 30) {
      const existing30 = await db.userBadge.findFirst({
        where: { userId, badgeId: "badge_streak_30" },
      })
      if (!existing30) {
        await db.userBadge.create({
          data: { userId, badgeId: "badge_streak_30" },
        })
      }
    }

    // Check whale badge
    if (updatedUser.balance >= 100000) {
      const existingWhale = await db.userBadge.findFirst({
        where: { userId, badgeId: "badge_whale" },
      })
      if (!existingWhale) {
        await db.userBadge.create({
          data: { userId, badgeId: "badge_whale" },
        })
      }
    }

    return NextResponse.json({
      success: true,
      reward,
      newStreak,
      multiplier,
      newBalance: updatedUser.balance,
    })
  } catch (error) {
    console.error("Claim error:", error)
    return NextResponse.json({ error: "Claim failed" }, { status: 500 })
  }
}
