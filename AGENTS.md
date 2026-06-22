# AGENTS.md

## Project Overview

LIA (Local International African Marketplace) is a multi-vendor African grocery delivery platform.

The platform connects:

* Customers
* African Grocery Stores
* Delivery Drivers
* Platform Administrators

The application is built as a Progressive Web App (PWA) using Next.js.

---

## Technology Stack

### Frontend

* Next.js App Router
* TypeScript
* Tailwind CSS
* Progressive Web App (PWA)

### Backend

* Firebase Authentication
* Firestore Database
* Firebase Storage
* Firebase Cloud Functions

### Integrations

* Stripe Connect
* Stripe Tax
* Shipday API
* Google Maps API
* Google Routes API
* Resend Email

---

## User Roles

### Customer

Can:

* Browse stores
* Browse products
* Add products to cart
* Checkout
* Track orders
* Save addresses
* Leave reviews

### Store Owner

Can:

* Manage store profile
* Manage products
* Manage inventory
* View orders
* Accept orders
* Mark orders ready for pickup
* View earnings

### Admin

Can:

* Approve stores
* Suspend stores
* View all orders
* View payouts
* Manage platform settings
* View reports

---

## Project Structure

src/

app/
components/
lib/
services/
hooks/
types/
utils/
context/

---

## Route Structure

Public

/
/stores
/store/[storeId]
/product/[productId]

Customer

/account
/account/orders
/account/profile
/cart
/checkout

Store

/store/dashboard
/store/products
/store/orders
/store/earnings
/store/settings

Admin

/admin
/admin/stores
/admin/orders
/admin/customers
/admin/reports

---

## Authentication Rules

Firebase Authentication is required.

Roles:

customer
store_owner
admin

All protected routes must verify user role before rendering.

Never trust role information from the frontend.

Always verify role using Firestore.

---

## Firestore Collections

users
stores
products
orders
orderItems
addresses
deliveries
payouts
reviews
notifications
settings

---

## Store Model

Store fields:

id
name
ownerId
phone
email
address
city
state
zip
latitude
longitude
deliveryRadius
stripeAccountId
status
createdAt

---

## Product Model

Product fields:

id
storeId
name
description
price
category
imageUrl
stock
active
createdAt

---

## Order Statuses

pending
accepted
preparing
ready_for_pickup
driver_assigned
picked_up
out_for_delivery
delivered
cancelled

---

## Payment Rules

Use Stripe Connect.

Store owners must have Stripe Connect accounts.

Never store card information.

Use Stripe Checkout whenever possible.

Platform collects commission from each order.

---

## Delivery Rules

Use Google Routes API for distance calculations.

Do not use straight-line distance.

Use actual driving distance.

Shipday is the source of truth for delivery tracking.

Store Shipday IDs in Firestore.

---

## Coding Standards

Use TypeScript.

Use interfaces for all data models.

Keep components small and reusable.

Avoid duplicated business logic.

Create reusable services inside:

src/services

Examples:

stripeService.ts
shipdayService.ts
storeService.ts
orderService.ts

---

## UI Guidelines

Use responsive mobile-first design.

Primary Colors:

Green
Orange
White

Brand:

African Grocery Delivery Platform

All pages should work well on:

* Mobile
* Tablet
* Desktop

---

## Future Features

Coupons
Loyalty Program
Referral Program
Push Notifications
Multi-language Support
Native Mobile App

These features should not block MVP development.

---

## MVP Priority

1. Authentication
2. Store Onboarding
3. Product Management
4. Customer Shopping
5. Checkout
6. Stripe Connect
7. Order Management
8. Shipday Integration
9. Notifications
10. Reporting
