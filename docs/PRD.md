# Product Requirements Document (PRD): Factory Agent & Customer Portal

## 1. Overview & Objectives

This document outlines the Phase 1 architecture and feature set for a digital ordering system designed to streamline B2B meat factory operations. The primary objective is to replace manual WhatsApp communication and data entry with a frictionless, self-serve pipeline that integrates directly with Hashavshevet.

## 2. User Personas

- **Sales Agent:** Factory representatives managing relationships with restaurants. They need rapid access to client profiles, catalog management, and link generation.
- **Customer (Restaurant/Butcher):** End-users placing routine orders. They require a frictionless, zero-login experience tailored exclusively to their specific menu needs and negotiated prices.

## 3. Core Architecture & Data Flow

- **Single Source of Truth (SSOT):** Hashavshevet. All customer profiles, master item catalogs, and customer-specific price lists live here. The application acts strictly as a read/write layer via the Hashavshevet API.
- **Connectivity State:** Always-online. The application requires an active internet connection to fetch real-time pricing and submit orders.
- **Authentication Model:** Tokenized Magic Links. Customers do not maintain passwords or accounts within the app.

## 4. Functional Requirements

### 4.1 Agent Interface (Mobile/Web App)

- **Customer Dashboard:** Agents view a list of their assigned customers, pulled directly from Hashavshevet.
- **Catalog & Permissions Management:** \* Agents can browse the master factory catalog.
  - Agents can add new items to a specific customer's profile. This adds the item permanently to the customer's "Approved Items" list.
- **Link Generation:** Agents tap a "Generate Order Link" button next to a customer's profile. This creates a secure, tokenized URL.
- **Dispatch:** A one-tap integration to send the generated URL directly to the customer via WhatsApp.

### 4.2 Customer Interface (Web Portal)

- **Frictionless Access:** Clicking the magic link authenticates the customer for that session and opens their dedicated ordering screen.
- **Tailored Layout:** The UI is strictly limited to relevant products, organized into two sections:
  - **Recent Items:** Products ordered within recent, previous deliveries.
  - **Approved Items:** The permanent whitelist of products approved for this specific customer (including newly requested custom cuts).
- **Dynamic Pricing:** All prices displayed are the customer's pre-negotiated rates, fetched dynamically from Hashavshevet upon link activation.
- **Cart & Checkout:** Customers input weight/quantities, review the total estimated cost, and submit.

### 4.3 Backend & Integration

- **Tokenization Security:** The backend generates secure session strings for the magic links, ensuring a user cannot access another business's portal by altering the URL parameters.
- **Hashavshevet Ingestion:** The backend receives the order from the web portal, formats it into the required API payload (or B-MAX XML), and injects it directly into Hashavshevet.
- **Validation:** The backend verifies that the submitted items and prices match the current state in Hashavshevet before committing the transaction to prevent ledger discrepancies.

## 5. Non-Functional Requirements

- **Performance:** The customer web portal must load instantly on mobile networks (3G/4G), as chefs often place orders from basements or walk-in refrigerators.
- **Security Lifecycle:** Tokenized links must expire after a set duration (e.g., 24 hours) or immediately after an order is successfully submitted to prevent duplicate orders.
- **Platform:** \* Agent App: Can be a responsive web app or cross-platform mobile app (React Native/Flutter).
  - Customer Portal: Must be a lightweight, responsive Web App. Customers will not be asked to download anything from an app store.
