// Google Maps API removed — voucher agora usa apenas um link direto do Google Maps
// (construído no cliente com endereço/nome do hotel) e não depende de conector.
export type HotelMapData = {
  address: string;
  formattedAddress: string | null;
  lat: number | null;
  lng: number | null;
  mapPngBase64: string | null;
  mapsUrl: string;
};
