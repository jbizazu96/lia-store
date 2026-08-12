/*
|--------------------------------------------------------------------------
| Admin Platform Reports
|--------------------------------------------------------------------------
|
| A protected operational report for the Admin workspace. It intentionally
| returns aggregates and daily buckets only; individual customer, payment,
| and delivery records stay behind their dedicated callables.
|
*/

import * as admin from "firebase-admin";
import {
  getFirestore,
  Timestamp,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {
  requireAdminPermission,
} from "../admin/adminAuthorizationService";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");
const PERIODS = new Set([7, 30, 90]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function asDate(value: unknown): Date | null {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const result = value.toDate();
    return result instanceof Date ? result : null;
  }
  if (typeof value === "string") {
    const result = new Date(value);
    return Number.isNaN(result.getTime()) ? null : result;
  }
  return null;
}

function requestedPeriod(value: unknown): number {
  const period = number(value) || 30;

  if (!PERIODS.has(period)) {
    throw new HttpsError("invalid-argument", "Choose a 7, 30, or 90 day report.");
  }

  return period;
}

export const getAdminPlatformReport = onCall(
  { region: "us-central1" },
  async (request) => {
    await requireAdminPermission(request, "reports");
    const periodDays = requestedPeriod(record(request.data).periodDays);
    const beginning = new Date();
    beginning.setUTCHours(0, 0, 0, 0);
    beginning.setUTCDate(beginning.getUTCDate() - (periodDays - 1));

    const endingDay = dayKey(new Date());
    const [dailyReports, activeStores, approvedDrivers, ordersSnapshot, customersSnapshot, storesSnapshot, zonesSnapshot] = await Promise.all([
      db.collection("platformDailyReports")
        .where("date", ">=", dayKey(beginning))
        .where("date", "<=", endingDay)
        .orderBy("date", "asc")
        .get(),
      db.collection("stores")
        .where("isApproved", "==", true)
        .where("isActive", "==", true)
        .count()
        .get(),
      db.collection("drivers")
        .where("status", "==", "approved")
        .count()
        .get(),
      db.collection("orders")
        .where("createdAt", ">=", Timestamp.fromDate(beginning))
        .limit(5001)
        .get(),
      db.collection("users").where("accountType", "==", "customer").get(),
      db.collection("stores").get(),
      db.collection("deliveryZones").get(),
    ]);

    const days = Array.from({ length: periodDays }, (_, index) => {
      const date = new Date(beginning);
      date.setUTCDate(beginning.getUTCDate() + index);
      return {
        date: dayKey(date),
        orders: 0,
        customers: 0,
        grossSalesAmount: 0,
      };
    });
    const byDay = new Map(days.map((item) => [item.date, item]));
    dailyReports.docs.forEach((document) => {
      const data = document.data();
      const bucket = byDay.get(text(data.date) || document.id);
      if (!bucket) return;
      bucket.orders = Math.max(0, number(data.confirmedOrders));
      bucket.customers = Math.max(0, number(data.newCustomers));
      bucket.grossSalesAmount = Math.max(0, number(data.grossCustomerPayments));
    });
    const deliveredOrders = dailyReports.docs.reduce(
      (total, document) => total + Math.max(0, number(document.data().deliveredOrders)),
      0,
    );
    const cancelledOrders = dailyReports.docs.reduce(
      (total, document) => total + Math.max(0, number(document.data().cancelledOrders)),
      0,
    );
    const grossSalesAmount = days.reduce(
      (total, item) => total + item.grossSalesAmount,
      0,
    );
    const zoneNames = new Map(zonesSnapshot.docs.map((document) => [
      document.id,
      text(document.data().name) || "Delivery zone",
    ]));
    const zoneTotals = new Map<string, {
      pricingZoneId: string | null;
      pricingZoneName: string;
      orders: number;
      revenueAmount: number;
      routeMiles: number;
      orderZoneExceptions: number;
      crossZoneDeliveries: number;
      peakSurchargeAmount: number;
    }>();
    let orderZoneExceptions = 0;
    let crossZoneDeliveries = 0;
    let routeMiles = 0;
    let zoneOrderCount = 0;
    let peakSurchargeAmount = 0;
    ordersSnapshot.docs.slice(0, 5000).forEach((document) => {
      const data = document.data();
      const payment = record(data.payment);
      if (data.checkoutStatus !== "confirmed" || payment.status !== "paid") return;
      const confirmedAt = asDate(payment.paidAt) ?? asDate(data.createdAt);
      if (!confirmedAt || confirmedAt < beginning) return;
      const pricing = record(data.pricing);
      const pricingPolicy = record(data.pricingPolicy);
      const pricingZoneId = text(data.pricingZoneId) || null;
      const key = pricingZoneId ?? "default_pricing";
      const distance = Math.max(0, number(data.trustedRouteDistanceMiles) || number(record(data.delivery).distanceMiles));
      const revenueAmount = Math.max(0, number(pricing.totalAmount));
      const isOrderZone = data.zoneAccessType === "customer_order_zone";
      const customerZoneId = text(data.customerHomeZoneId);
      const storeZoneId = text(data.storeHomeZoneId);
      const isCrossZone = Boolean(customerZoneId && storeZoneId && customerZoneId !== storeZoneId);
      const appliedPeak = Math.max(0,
        number(pricing.peakSurchargeAmount) ||
        (pricing.isPeakTime === true ? number(pricingPolicy.peakSurchargeCents) : 0),
      );
      const current = zoneTotals.get(key) ?? {
        pricingZoneId,
        pricingZoneName: pricingZoneId ? zoneNames.get(pricingZoneId) ?? "Deleted or renamed zone" : "Default Customer Pricing",
        orders: 0,
        revenueAmount: 0,
        routeMiles: 0,
        orderZoneExceptions: 0,
        crossZoneDeliveries: 0,
        peakSurchargeAmount: 0,
      };
      current.orders += 1;
      current.revenueAmount += revenueAmount;
      current.routeMiles += distance;
      current.orderZoneExceptions += isOrderZone ? 1 : 0;
      current.crossZoneDeliveries += isCrossZone ? 1 : 0;
      current.peakSurchargeAmount += appliedPeak;
      zoneTotals.set(key, current);
      zoneOrderCount += 1;
      routeMiles += distance;
      orderZoneExceptions += isOrderZone ? 1 : 0;
      crossZoneDeliveries += isCrossZone ? 1 : 0;
      peakSurchargeAmount += appliedPeak;
    });
    const zones = [...zoneTotals.values()].map((zone) => ({
      ...zone,
      averageRouteMiles: zone.orders > 0 ? zone.routeMiles / zone.orders : 0,
    })).sort((left, right) => right.orders - left.orders || left.pricingZoneName.localeCompare(right.pricingZoneName));
    const customersWithoutZone = customersSnapshot.docs.filter((document) => !text(document.data().homeZoneId)).length;
    const storesWithoutHomeZone = storesSnapshot.docs.filter((document) => !text(document.data().homeZoneId)).length;

    return {
      periodDays,
      limited: false,
      metrics: {
        confirmedOrders: days.reduce((total, item) => total + item.orders, 0),
        deliveredOrders,
        cancelledOrders,
        grossSalesAmount,
        newCustomers: days.reduce((total, item) => total + item.customers, 0),
        activeStores: activeStores.data().count,
        approvedDrivers: approvedDrivers.data().count,
        averageRouteMiles: zoneOrderCount > 0 ? routeMiles / zoneOrderCount : 0,
        orderZoneExceptions,
        customersWithoutZone,
        storesWithoutHomeZone,
        crossZoneDeliveries,
        peakSurchargeAmount,
      },
      daily: days,
      zones,
      zoneReportingLimited: ordersSnapshot.size > 5000,
    };
  }
);
