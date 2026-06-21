import { db } from "@/lib/db"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const { referrerCode, newUserId } = await req.json()
    if (!referrerCode || !newUserId) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 })
    }

    const referrer = await db.user.findUnique({
      where: { referralCode: referrerCode },
    })
    if (!referrer) {
      return NextResponse.json({ error: "Invalid referral code" }, { status: 404 })
    }
    if (referrer.id === newUserId) {
      return NextResponse.json({ error: "Cannot refer yourself" }, { status: 400 })
    }

    const newUser = await db.user.findUnique({ where: { id: newUserId } })
    if (!newUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }
    if (newUser.referredBy) {
      return NextResponse.json({ error: "Already referred" }, { status: 400 })
    }

    const REFERRAL_BONUSES = { 1: 50, 2: 20, 3: 10 }

    // Create L1 referral
    await db.referral.create({
      data: {
        referrerId: referrer.id,
        referredId: newUserId,
        level: 1,
        bonus: REFERRAL_BONUSES[1],
      },
    })

    // Update referrer
    await db.user.update({
      where: { id: referrer.id },
      data: {
        balance: { increment: REFERRAL_BONUSES[1] },
        totalClaimed: { increment: REFERRAL_BONUSES[1] },
      },
    })

    // Update new user
    await db.user.update({
      where: { id: newUserId },
      data: { referredBy: referrer.id },
    })

    // Check if referrer also has a referrer (L2)
    if (referrer.referredBy) {
      const l2Referrer = await db.user.findUnique({ where: { id: referrer.referredBy } })
      if (l2Referrer) {
        await db.referral.create({
          data: {
            referrerId: l2Referrer.id,
            referredId: newUserId,
            level: 2,
            bonus: REFERRAL_BONUSES[2],
          },
        })
        await db.user.update({
          where: { id: l2Referrer.id },
          data: { balance: { increment: REFERRAL_BONUSES[2] } },
        })

        // L3
        if (l2Referrer.referredBy) {
          const l3Referrer = await db.user.findUnique({ where: { id: l2Referrer.referredBy } })
          if (l3Referrer) {
            await db.referral.create({
              data: {
                referrerId: l3Referrer.id,
                referredId: newUserId,
                level: 3,
                bonus: REFERRAL_BONUSES[3],
              },
            })
            await db.user.update({
              where: { id: l3Referrer.id },
              data: { balance: { increment: REFERRAL_BONUSES[3] } },
            })
          }
        }
      }
    }

    // Check referrer badge for 50+ referrals
    const referralCount = await db.referral.count({
      where: { referrerId: referrer.id, level: 1 },
    })
    if (referralCount >= 50) {
      const existingBadge = await db.userBadge.findFirst({
        where: { userId: referrer.id, badgeId: "badge_referrer_50" },
      })
      if (!existingBadge) {
        await db.userBadge.create({
          data: { userId: referrer.id, badgeId: "badge_referrer_50" },
        })
      }
    }

    return NextResponse.json({ success: true, referralCode: referrerCode })
  } catch (error) {
    console.error("Referral error:", error)
    return NextResponse.json({ error: "Referral failed" }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 })
  }

  try {
    const referrals = await db.referral.findMany({
      where: { referrerId: userId },
      include: {
        referred: {
          select: { displayName: true, photoURL: true, createdAt: true },
        },
      },
      orderBy: { ts: "desc" },
    })

    return NextResponse.json(referrals)
  } catch (error) {
    console.error("Referral fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch referrals" }, { status: 500 })
  }
}
