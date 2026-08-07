/**
 * Packaged accreditation bodies OurSay chooses for the Alberta (ab-ca-gov) deployment.
 * Catalog rows live in auth.accreditation_bodies; this list is the authoring source for
 * display names + which ids appear on JurisdictionConfig.recognizedAccreditationBodyIds.
 *
 * Recognition is platform policy for the deployment — not a government decision or partnership.
 * Ids are slug-stable; prefer provincial gallery + widely held national / major-municipal credentials.
 */

export type PackagedAccreditationBody = { id: string; name: string };

export const abCaGovAccreditationBodies: PackagedAccreditationBody[] = [
  {
    id: "ab-leg-gallery",
    name: "Alberta Legislative Assembly Press Gallery",
  },
  {
    id: "ca-caj",
    name: "Canadian Association of Journalists",
  },
  {
    id: "ca-parl-gallery",
    name: "Canadian Parliamentary Press Gallery",
  },
  {
    id: "ab-edm-media",
    name: "City of Edmonton Media Credentials",
  },
  {
    id: "ab-calgary-media",
    name: "City of Calgary Media Credentials",
  },
];

/** OurSay recognition list for this jurisdiction (= packaged ids for V1). */
export const abCaGovRecognizedAccreditationBodyIds: string[] =
  abCaGovAccreditationBodies.map((b) => b.id);
