"use client";

import { useState } from "react";
import { Button, Modal, ModalField } from "@/components/ui";

export interface AddressFormData {
  line1: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

interface ChangeAddressModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: AddressFormData) => void;
  /** When true, show residency attestation consent copy. */
  attestResidency?: boolean;
}

/**
 * Minimal address editor for live `PATCH /v1/profile` + optional residency attest.
 */
export function ChangeAddressModal({
  open,
  onClose,
  onSubmit,
  attestResidency = false,
}: ChangeAddressModalProps) {
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("CA");

  const canSave =
    line1.trim().length > 0 &&
    city.trim().length > 0 &&
    province.trim().length > 0 &&
    postalCode.trim().length > 0;

  return (
    <Modal open={open} onClose={onClose} title="Change Address" mobileFull>
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Your address is private — it is used to place you in home districts and
          verify residency. It is never shown on the public record.
        </p>
        <ModalField
          label="Street address"
          placeholder="123 Main St"
          value={line1}
          onChange={(e) => setLine1(e.target.value)}
        />
        <ModalField
          label="City"
          placeholder="Edmonton"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <ModalField
            label="Province"
            placeholder="AB"
            value={province}
            onChange={(e) => setProvince(e.target.value)}
          />
          <ModalField
            label="Postal code"
            placeholder="T5K 0A1"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
          />
        </div>
        <ModalField
          label="Country"
          placeholder="CA"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        />
        {attestResidency ? (
          <p className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs text-muted">
            Saving will request residency verification for your home jurisdiction
            (platform self-attest in dev; Didit POA when enabled).
          </p>
        ) : null}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button
            fullWidth
            disabled={!canSave}
            onClick={() =>
              onSubmit({
                line1: line1.trim(),
                city: city.trim(),
                province: province.trim(),
                postalCode: postalCode.trim(),
                country: country.trim() || "CA",
              })
            }
          >
            Save address
          </Button>
        </div>
      </div>
    </Modal>
  );
}
