import sharp from 'sharp';

interface ExifData {
  GPSLatitude?: number[];
  GPSLatitudeRef?: string;
  GPSLongitude?: number[];
  GPSLongitudeRef?: string;
  DateTimeOriginal?: string;
  Software?: string;
  [key: string]: unknown;
}

interface MetadataWithExif {
  exif?: ExifData;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function parseGPS(coord: number[] | undefined, ref: string | undefined): number | null {
  if (!coord || !Array.isArray(coord) || coord.length < 3) return null;
  const [deg, min, sec] = coord.map((c) => {
    if (typeof c === 'object' && c !== null && 'numerator' in c && 'denominator' in c) {
      return (c as { numerator: number; denominator: number }).numerator / (c as { numerator: number; denominator: number }).denominator;
    }
    return Number(c);
  });
  let decimal = (deg ?? 0) + (min ?? 0) / 60 + (sec ?? 0) / 3600;
  if (ref === 'S' || ref === 'W') decimal = -decimal;
  return decimal;
}

export async function validateImageAuthenticity(
  imageUrl: string,
  reportLat: number,
  reportLng: number
): Promise<ImageAuthResult> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return { valid: false, penalty: 50, flags: ['FETCH_FAILED'], reason: 'Failed to fetch image', exif: { gps: false, timestamp: false, software: 'none' } };
    const buffer = Buffer.from(await res.arrayBuffer());
    const metadata = await sharp(buffer).metadata();
    const exif = metadata.exif as ExifData | undefined;

    if (!exif) {
      return { valid: false, penalty: 30, flags: ['NO_EXIF'], reason: 'No EXIF data — possible screenshot, edited image, or downloaded from web', exif: { gps: false, timestamp: false, software: 'none' } };
    }

    const flags: string[] = [];
    let penalty = 0;

    const gpsLat = parseGPS(exif.GPSLatitude, exif.GPSLatitudeRef);
    const gpsLng = parseGPS(exif.GPSLongitude, exif.GPSLongitudeRef);

    if (gpsLat !== null && gpsLng !== null) {
      const distance = haversine(gpsLat, gpsLng, reportLat, reportLng);
      if (distance > 1.0) {
        flags.push(`GPS_MISMATCH_${distance.toFixed(1)}km`);
        penalty += 20;
      }
    } else {
      flags.push('NO_GPS');
      penalty += 15;
    }

    const takenAt = exif.DateTimeOriginal ? new Date(exif.DateTimeOriginal.replace(':', '-').replace(':', '-')).getTime() : null;
    if (takenAt) {
      const hoursAgo = (Date.now() - takenAt) / 3.6e6;
      if (hoursAgo > 48) {
        flags.push(`OLD_PHOTO_${Math.round(hoursAgo)}h`);
        penalty += 10;
      }
    } else {
      flags.push('NO_TIMESTAMP');
      penalty += 5;
    }

    const software = exif.Software || '';
    if (/screenshot|edit|photoshop|snapseed|lightroom|picsart|vsco|afterlight/i.test(software)) {
      flags.push('EDITED_SOFTWARE');
      penalty += 15;
    }

    return { valid: penalty < 30, penalty, flags, exif: { gps: gpsLat !== null, timestamp: !!takenAt, software: software || 'unknown' } };
  } catch (e) {
    return { valid: false, penalty: 50, flags: ['ANALYSIS_ERROR'], reason: e instanceof Error ? e.message : String(e), exif: { gps: false, timestamp: false, software: 'error' } };
  }
}

export interface ImageAuthResult {
  valid: boolean;
  penalty: number;
  flags: string[];
  reason?: string;
  exif: { gps: boolean; timestamp: boolean; software: string };
}