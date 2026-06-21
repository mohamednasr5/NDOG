import { db } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    return NextResponse.json({
      enabled: true,
      currentRound: 1,
      rounds: {
        round_1: {
          name_en: "Early Adopter Airdrop",
          name_ar: "أيردروب المؤسسين",
          totalPool: 1000000,
          distributed: 0,
          startDate: "2025-01-01T00:00:00Z",
          endDate: "2027-12-31T23:59:59Z",
          criteria: { minBalance: 100, minClaims: 30, noBans: true },
        },
      },
    })
  } catch (error) {
    console.error("Airdrop error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
