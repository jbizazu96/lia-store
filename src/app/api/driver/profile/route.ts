import { NextResponse } from "next/server";
import { isFirebaseAuthenticationError, requireFirebaseUser } from "@/lib/auth/requireFirebaseUser";
import { serverDriverWorkspaceService } from "@/services/driver/serverDriverWorkspaceService";

export async function PATCH(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    const body = await request.json() as Record<string, unknown>;
    const object = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : {};
    const address = object(body.address);
    const serviceArea = object(body.serviceArea);
    const vehicle = object(body.vehicle);
    const summary = await serverDriverWorkspaceService.updateProfile(user.uid, {
      firstName: typeof body.firstName === "string" ? body.firstName : "",
      middleName: typeof body.middleName === "string" ? body.middleName : "",
      lastName: typeof body.lastName === "string" ? body.lastName : "",
      email: "",
      phone: typeof body.phone === "string" ? body.phone : "",
      dateOfBirth: "",
      address: { street: typeof address.street === "string" ? address.street : "", apartment: typeof address.apartment === "string" ? address.apartment : "", city: typeof address.city === "string" ? address.city : "", state: typeof address.state === "string" ? address.state : "", zip: typeof address.zip === "string" ? address.zip : "", formattedAddress: "" },
      serviceArea: { city: typeof serviceArea.city === "string" ? serviceArea.city : "", state: typeof serviceArea.state === "string" ? serviceArea.state : "", preferredRadiusMiles: typeof serviceArea.preferredRadiusMiles === "number" ? serviceArea.preferredRadiusMiles : null, approvedRadiusMiles: null },
      vehicle: { make: typeof vehicle.make === "string" ? vehicle.make : "", model: typeof vehicle.model === "string" ? vehicle.model : "", year: typeof vehicle.year === "number" ? vehicle.year : null, color: typeof vehicle.color === "string" ? vehicle.color : "", licensePlate: typeof vehicle.licensePlate === "string" ? vehicle.licensePlate : "", registrationState: typeof vehicle.registrationState === "string" ? vehicle.registrationState : "" },
    });
    return NextResponse.json(summary);
  } catch (error) {
    const unauthorized = isFirebaseAuthenticationError(error) || error instanceof Error && error.message === "DRIVER_FORBIDDEN";
    const invalid = error instanceof Error && error.message === "INVALID_PROFILE";
    const addressError = error instanceof Error && error.message === "ADDRESS_NOT_FOUND";
    return NextResponse.json({ error: invalid ? "Complete your profile, address, service area, and vehicle information using valid values." : addressError ? "We could not verify your home address. Check the street, city, state, and ZIP code." : unauthorized ? "You do not have access to this profile." : "Unable to update your profile." }, { status: invalid || addressError ? 400 : unauthorized ? 403 : 500 });
  }
}
