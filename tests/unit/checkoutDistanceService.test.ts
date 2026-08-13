import {afterEach, describe, expect, it, vi} from "vitest";
import {
  CheckoutDistanceError,
  checkoutDistanceService,
} from "../../functions/src/payment/checkout/checkoutDistanceService";

describe("checkout route matrix distance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns each matrix distance in origin order", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      {originIndex: 1, destinationIndex: 0, condition: "ROUTE_EXISTS", distanceMeters: 3218.688},
      {originIndex: 0, destinationIndex: 0, condition: "ROUTE_EXISTS", distanceMeters: 1609.344},
    ]), {status: 200}));
    vi.stubGlobal("fetch", fetchMock);

    const distances = await checkoutDistanceService
      .getTrustedDrivingDistanceMatrixMiles(
        [
          {latitude: 41.6611, longitude: -91.5302},
          {latitude: 41.7001, longitude: -91.6082},
        ],
        {latitude: 41.5868, longitude: -93.625},
        "test-key",
      );

    expect(distances).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("leaves an unavailable matrix element for the caller to retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      {originIndex: 0, destinationIndex: 0, condition: "ROUTE_NOT_FOUND"},
    ]), {status: 200})));

    await expect(checkoutDistanceService.getTrustedDrivingDistanceMatrixMiles(
      [{latitude: 41.6611, longitude: -91.5302}],
      {latitude: 41.5868, longitude: -93.625},
      "test-key",
    )).resolves.toEqual([null]);
  });

  it("rejects oversized matrices before contacting Google", async () => {
    await expect(checkoutDistanceService.getTrustedDrivingDistanceMatrixMiles(
      Array.from({length: 51}, (_, index) => ({
        latitude: 40 + index / 100,
        longitude: -91,
      })),
      {latitude: 41.5868, longitude: -93.625},
      "test-key",
    )).rejects.toBeInstanceOf(CheckoutDistanceError);
  });
});
