/**
 * @file src/core/vault/field-templates.ts
 * Pre-built custom-field templates exposed in the AddEditEntry modal.
 */
import type { CustomField } from "./schema";

export interface FieldTemplate {
  id: string;
  name: string;
  icon: string;
  fields: Omit<CustomField, "id">[];
}

export const FIELD_TEMPLATES: FieldTemplate[] = [
  {
    id: "credit-card",
    name: "Credit Card",
    icon: "💳",
    fields: [
      { label: "Card Number", value: "", type: "password", protected: true },
      { label: "Cardholder", value: "", type: "text", protected: false },
      { label: "Expiry", value: "", type: "text", protected: false },
      { label: "CVV", value: "", type: "password", protected: true },
    ],
  },
  {
    id: "ssh-key",
    name: "SSH Key",
    icon: "🔑",
    fields: [
      { label: "Host", value: "", type: "url", protected: false },
      { label: "Username", value: "", type: "text", protected: false },
      { label: "Private Key", value: "", type: "password", protected: true },
      { label: "Passphrase", value: "", type: "password", protected: true },
    ],
  },
  {
    id: "api",
    name: "API Credentials",
    icon: "🔌",
    fields: [
      { label: "Endpoint", value: "", type: "url", protected: false },
      { label: "API Key", value: "", type: "password", protected: true },
      { label: "Secret", value: "", type: "password", protected: true },
    ],
  },
  {
    id: "wifi",
    name: "Wi-Fi",
    icon: "📶",
    fields: [
      { label: "SSID", value: "", type: "text", protected: false },
      { label: "Password", value: "", type: "password", protected: true },
      { label: "Encryption", value: "", type: "text", protected: false },
    ],
  },
];
