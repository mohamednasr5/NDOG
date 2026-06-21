import { db } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    // Top balances
    const topBalance = await db.user.findMany({
      select: { id: true, displayName: true, photoURL: true, balance: true, totalClaimed: true },
      orderBy: { balance: "desc" },
      take: 20,
    })

    // Top streaks
    const topStreak = await db.user.findMany({
      select: { id: true, displayName: true, photoURL: true, streak: true },
      orderBy: { streak: "desc" },
      take: 20,
    })

    // Top referrals
    const allUsers = await db.user.findMany({
      select: { id: true, displayName: true, photoURL: true },
    })
    const referralCounts = await Promise.all(
      allUsers.map(async (u) => {
        const count = await db.referral.count({ where: { referrerId: u.id, level: 1 } })
        return { ...u, referralCount: count }
      })
    )
    const topReferrals = referralCounts
      .sort((a, b) => b.referralCount - a.referralCount)
      .slice(0, 20)

    return NextResponse.json({
      topBalance: topBalance.map((u, i) => ({ rank: i + 1, ...u })),
      topStreak: topStreak.map((u, i) => ({ rank: i + 1, ...u })),
      topReferrals: topReferrals.map((u, i) => ({ rank: i + 1, ...u })),
    })
  } catch (error) {
    console.error("Leaderboard error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
