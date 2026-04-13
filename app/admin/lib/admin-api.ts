import {
  CategoryItem,
  DirectoryCellItem,
  DirectoryDistrictItem,
  DirectoryZoneItem,
  EventItem,
  MediaItem,
  SpeakerItem,
  ThemeSettings,
} from "./admin-store";

type ApiEnvelope<T> = {
  data: T;
};

type ApiErrorPayload = {
  message?: string;
  errors?: Record<string, string[]>;
};

const DEFAULT_API_BASE_URL = "https://b.bmp.com.ng";
const NETWORK_ERROR_PATTERNS = [
  "network error",
  "failed to fetch",
  "network request failed",
  "internet connection dropped during upload",
  "the internet connection appears to be offline",
] as const;
const TRANSPORT_ERROR_PATTERNS = [
  "upload request failed before the server returned a response",
  "invalid response from server",
  "upload was cancelled",
] as const;

function getApiBaseUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (!value) {
    return DEFAULT_API_BASE_URL;
  }

  return value.replace(/\/+$/, "");
}

function buildApiUrl(path: string): string | null {
  const base = getApiBaseUrl();
  if (!base) {
    return null;
  }

  return `${base}${path}`;
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | ApiErrorPayload | null;

  if (!response.ok) {
    const fallback = `API request failed with status ${response.status}`;
    const message = payload && "message" in payload && payload.message ? payload.message : fallback;
    const errors =
      payload && "errors" in payload && payload.errors
        ? Object.values(payload.errors)
            .flat()
            .filter(Boolean)
            .join(" ")
        : "";
    const combined = errors && errors !== message ? `${message} ${errors}`.trim() : message;

    throw new Error(combined);
  }

  if (!payload || !("data" in payload)) {
    throw new Error(
      "Invalid API response. Check NEXT_PUBLIC_API_BASE_URL, backend availability, and CORS configuration.",
    );
  }

  return payload.data;
}

async function ensureSuccess(response: Response): Promise<boolean> {
  if (response.ok) {
    return true;
  }

  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  const fallback = `API request failed with status ${response.status}`;
  const message = payload?.message || fallback;
  const errors = payload?.errors
    ? Object.values(payload.errors)
        .flat()
        .filter(Boolean)
        .join(" ")
    : "";

  throw new Error(errors && errors !== message ? `${message} ${errors}`.trim() : message);
}

export function hasApiBaseUrl(): boolean {
  return Boolean(getApiBaseUrl());
}

export function isLikelyNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return NETWORK_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function isLikelyUploadTransportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return TRANSPORT_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export async function fetchCategoriesApi(): Promise<CategoryItem[] | null> {
  const url = buildApiUrl("/api/admin/categories");
  if (!url) {
    return null;
  }

  const response = await fetch(url);
  return parseEnvelope<CategoryItem[]>(response);
}

export async function createCategoryApi(name: string): Promise<CategoryItem | null> {
  const url = buildApiUrl("/api/admin/categories");
  if (!url) {
    return null;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  return parseEnvelope<CategoryItem>(response);
}

export async function updateCategoryApi(id: string, name: string): Promise<CategoryItem | null> {
  const url = buildApiUrl(`/api/admin/categories/${id}`);
  if (!url) {
    return null;
  }

  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  return parseEnvelope<CategoryItem>(response);
}

export async function deleteCategoryApi(id: string): Promise<boolean> {
  const url = buildApiUrl(`/api/admin/categories/${id}`);
  if (!url) {
    return false;
  }

  const response = await fetch(url, { method: "DELETE" });
  return ensureSuccess(response);
}

export async function createSubcategoryApi(categoryId: string, name: string): Promise<{ id: string; name: string } | null> {
  const url = buildApiUrl(`/api/admin/categories/${categoryId}/subcategories`);
  if (!url) {
    return null;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  return parseEnvelope<{ id: string; name: string }>(response);
}

export async function updateSubcategoryApi(subcategoryId: string, name: string): Promise<{ id: string; name: string } | null> {
  const url = buildApiUrl(`/api/admin/subcategories/${subcategoryId}`);
  if (!url) {
    return null;
  }

  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  return parseEnvelope<{ id: string; name: string }>(response);
}

export async function deleteSubcategoryApi(subcategoryId: string): Promise<boolean> {
  const url = buildApiUrl(`/api/admin/subcategories/${subcategoryId}`);
  if (!url) {
    return false;
  }

  const response = await fetch(url, { method: "DELETE" });
  return ensureSuccess(response);
}

export async function fetchSpeakersApi(): Promise<SpeakerItem[] | null> {
  const url = buildApiUrl("/api/admin/speakers");
  if (!url) {
    return null;
  }

  const response = await fetch(url);
  return parseEnvelope<SpeakerItem[]>(response);
}

type SaveSpeakerInput = {
  name: string;
  imageFile?: File | null;
  removeImage?: boolean;
};

function buildSpeakerFormData(input: SaveSpeakerInput): FormData {
  const formData = new FormData();
  formData.append("name", input.name.trim());

  if (input.imageFile) {
    formData.append("image_file", input.imageFile);
  }

  if (input.removeImage) {
    formData.append("remove_image", "1");
  }

  return formData;
}

export async function createSpeakerApi(input: SaveSpeakerInput): Promise<SpeakerItem | null> {
  const url = buildApiUrl("/api/admin/speakers");
  if (!url) {
    return null;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: buildSpeakerFormData(input),
  });

  return parseEnvelope<SpeakerItem>(response);
}

export async function updateSpeakerApi(id: string, input: SaveSpeakerInput): Promise<SpeakerItem | null> {
  const url = buildApiUrl(`/api/admin/speakers/${id}`);
  if (!url) {
    return null;
  }

  const formData = buildSpeakerFormData(input);
  formData.append("_method", "PUT");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: formData,
  });

  return parseEnvelope<SpeakerItem>(response);
}

export async function deleteSpeakerApi(id: string): Promise<boolean> {
  const url = buildApiUrl(`/api/admin/speakers/${id}`);
  if (!url) {
    return false;
  }

  const response = await fetch(url, { method: "DELETE" });
  return ensureSuccess(response);
}

export async function fetchMediaItemsApi(): Promise<MediaItem[] | null> {
  const url = buildApiUrl("/api/admin/media");

  if (!url) {
    return null;
  }

  const response = await fetch(url);
  return parseEnvelope<MediaItem[]>(response);
}

type SaveMediaInput = {
  title: string;
  description: string;
  category: string;
  subcategory: string;
  speaker: string;
  mediaDate: string;
  mediaSourceType: "link" | "file" | "";
  mediaUrl: string;
  thumbnailUrl: string;
  thumbnailFile: File | null;
  audioFile: File | null;
  isPublished: boolean;
};

export type UploadProgressCallback = (percent: number) => void;

export async function saveMediaItemApi(
  input: SaveMediaInput,
  id?: string,
  onProgress?: UploadProgressCallback,
): Promise<MediaItem | null> {
  const createUrl = buildApiUrl("/api/admin/media");
  const updateUrl = id ? buildApiUrl(`/api/admin/media/${id}`) : null;

  if (!createUrl || (id && !updateUrl)) {
    return null;
  }

  const formData = new FormData();
  const trimmedMediaUrl = input.mediaUrl.trim();
  const trimmedThumbnailUrl = input.thumbnailUrl.trim();
  const trimmedMediaDate = input.mediaDate.trim();
  const mediaSourceType = input.mediaSourceType === "link" || input.mediaSourceType === "file"
    ? input.mediaSourceType
    : "";
  const shouldSendMediaUrl = !(mediaSourceType === "file" && input.audioFile);

  formData.append("title", input.title);
  formData.append("description", input.description);
  formData.append("category", input.category);
  formData.append("subcategory", input.subcategory);
  formData.append("speaker", input.speaker);

  if (trimmedMediaDate) {
    formData.append("media_date", trimmedMediaDate);
  }

  if (shouldSendMediaUrl && trimmedMediaUrl) {
    formData.append("media_url", trimmedMediaUrl);
  }

  if (mediaSourceType) {
    formData.append("media_source_type", mediaSourceType);
  }

  if (trimmedThumbnailUrl) {
    formData.append("thumbnail_url", trimmedThumbnailUrl);
  }

  formData.append("is_published", input.isPublished ? "1" : "0");

  if (input.thumbnailFile) {
    formData.append("thumbnail_file", input.thumbnailFile);
  }

  if (input.audioFile) {
    formData.append("audio_file", input.audioFile);
  }

  // When files are attached and a progress callback is provided, use XHR
  // so we can report upload progress to the UI.
  const hasFiles = Boolean(input.audioFile || input.thumbnailFile);

  if (hasFiles && onProgress) {
    if (id) {
      formData.append("_method", "PUT");
    }
    const targetUrl = id ? (updateUrl as string) : createUrl;

    return new Promise<MediaItem>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      });

      xhr.addEventListener("load", () => {
        try {
          const payload = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && payload && "data" in payload) {
            resolve(payload.data as MediaItem);
          } else {
            const message = payload?.message || `Upload failed with status ${xhr.status}`;
            const errors = payload?.errors
              ? Object.values(payload.errors as Record<string, string[]>).flat().filter(Boolean).join(" ")
              : "";
            reject(new Error(errors && errors !== message ? `${message} ${errors}`.trim() : message));
          }
        } catch {
          reject(new Error("Invalid response from server."));
        }
      });

      xhr.addEventListener("error", () => {
        const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        reject(
          new Error(
            isOffline
              ? "Internet connection dropped during upload."
              : "Upload request failed before the server returned a response.",
          ),
        );
      });
      xhr.addEventListener("abort", () => reject(new Error("Upload was cancelled.")));

      xhr.open("POST", targetUrl);
      xhr.setRequestHeader("Accept", "application/json");
      xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
      xhr.send(formData);
    });
  }

  // Fallback to fetch when there are no files or no progress callback
  let response: Response;

  if (id) {
    formData.append("_method", "PUT");
    response = await fetch(updateUrl as string, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: formData,
    });
  } else {
    response = await fetch(createUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: formData,
    });
  }

  return parseEnvelope<MediaItem>(response);
}

export async function deleteMediaItemApi(id: string): Promise<boolean> {
  const url = buildApiUrl(`/api/admin/media/${id}`);
  if (!url) {
    return false;
  }

  const response = await fetch(url, { method: "DELETE" });
  return response.ok;
}

export async function updateMediaPublishStatusApi(id: string, isPublished: boolean): Promise<MediaItem | null> {
  const url = buildApiUrl(`/api/admin/media/${id}/publish`);
  if (!url) {
    return null;
  }

  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_published: isPublished }),
  });

  return parseEnvelope<MediaItem>(response);
}

export async function fetchEventsApi(): Promise<EventItem[] | null> {
  const url = buildApiUrl("/api/admin/events");

  if (!url) {
    return null;
  }

  const response = await fetch(url);
  return parseEnvelope<EventItem[]>(response);
}

type SaveEventInput = {
  name: string;
  eventDate: string;
  description: string;
  mediaUrl: string;
  registrationEnabled: boolean;
};

export async function saveEventApi(input: SaveEventInput, id?: string): Promise<EventItem | null> {
  const createUrl = buildApiUrl("/api/admin/events");
  const updateUrl = id ? buildApiUrl(`/api/admin/events/${id}`) : null;

  if (!createUrl || (id && !updateUrl)) {
    return null;
  }

  const body = JSON.stringify(input);

  const response = await fetch(id ? (updateUrl as string) : createUrl, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  return parseEnvelope<EventItem>(response);
}

export async function deleteEventApi(id: string): Promise<boolean> {
  const url = buildApiUrl(`/api/admin/events/${id}`);
  if (!url) {
    return false;
  }

  const response = await fetch(url, { method: "DELETE" });
  return response.ok;
}

export async function fetchThemeSettingsApi(): Promise<ThemeSettings | null> {
  const url = buildApiUrl("/api/admin/theme-settings");

  if (!url) {
    return null;
  }

  const response = await fetch(url);
  return parseEnvelope<ThemeSettings>(response);
}

export async function saveThemeSettingsApi(settings: ThemeSettings): Promise<ThemeSettings | null> {
  const url = buildApiUrl("/api/admin/theme-settings");

  if (!url) {
    return null;
  }

  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });

  return parseEnvelope<ThemeSettings>(response);
}

type BlogPostPayload = {
  title: string;
  excerpt: string;
  content: string;
  publishDate: string;
  status: "draft" | "published";
};

export async function createBlogPostApi(payload: BlogPostPayload): Promise<boolean> {
  const url = buildApiUrl("/api/admin/blog-posts");

  if (!url) {
    return false;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return response.ok;
}

type SaveDistrictInput = {
  name: string;
  sortOrder: number;
  coverageAreas: string;
  homeCellPastors: string[];
  homeCellMinister: string;
  outreachPastor: string;
  outreachMinister: string;
  outreachLocation: string;
};

type SaveZoneInput = {
  name: string;
  sortOrder: number;
  zoneMinister: string;
};

type SaveCellInput = {
  name: string;
  sortOrder: number;
  address: string;
  minister: string;
  phone: string;
};

export async function fetchDistrictDirectoryApi(): Promise<DirectoryDistrictItem[] | null> {
  const url = buildApiUrl("/api/admin/districts");
  if (!url) {
    return null;
  }

  const response = await fetch(url);
  return parseEnvelope<DirectoryDistrictItem[]>(response);
}

export async function saveDistrictApi(
  input: SaveDistrictInput,
  id?: string,
): Promise<DirectoryDistrictItem | null> {
  const createUrl = buildApiUrl("/api/admin/districts");
  const updateUrl = id ? buildApiUrl(`/api/admin/districts/${id}`) : null;

  if (!createUrl || (id && !updateUrl)) {
    return null;
  }

  const response = await fetch(id ? (updateUrl as string) : createUrl, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseEnvelope<DirectoryDistrictItem>(response);
}

export async function deleteDistrictApi(id: string): Promise<boolean> {
  const url = buildApiUrl(`/api/admin/districts/${id}`);
  if (!url) {
    return false;
  }

  const response = await fetch(url, { method: "DELETE" });
  return ensureSuccess(response);
}

export async function createDistrictZoneApi(
  districtId: string,
  input: SaveZoneInput,
): Promise<DirectoryZoneItem | null> {
  const url = buildApiUrl(`/api/admin/districts/${districtId}/zones`);
  if (!url) {
    return null;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseEnvelope<DirectoryZoneItem>(response);
}

export async function updateDistrictZoneApi(
  zoneId: string,
  input: SaveZoneInput,
): Promise<DirectoryZoneItem | null> {
  const url = buildApiUrl(`/api/admin/district-zones/${zoneId}`);
  if (!url) {
    return null;
  }

  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseEnvelope<DirectoryZoneItem>(response);
}

export async function deleteDistrictZoneApi(zoneId: string): Promise<boolean> {
  const url = buildApiUrl(`/api/admin/district-zones/${zoneId}`);
  if (!url) {
    return false;
  }

  const response = await fetch(url, { method: "DELETE" });
  return ensureSuccess(response);
}

export async function createHomeCellApi(
  zoneId: string,
  input: SaveCellInput,
): Promise<DirectoryCellItem | null> {
  const url = buildApiUrl(`/api/admin/district-zones/${zoneId}/cells`);
  if (!url) {
    return null;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseEnvelope<DirectoryCellItem>(response);
}

export async function updateHomeCellApi(
  cellId: string,
  input: SaveCellInput,
): Promise<DirectoryCellItem | null> {
  const url = buildApiUrl(`/api/admin/home-cells/${cellId}`);
  if (!url) {
    return null;
  }

  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseEnvelope<DirectoryCellItem>(response);
}

export async function deleteHomeCellApi(cellId: string): Promise<boolean> {
  const url = buildApiUrl(`/api/admin/home-cells/${cellId}`);
  if (!url) {
    return false;
  }

  const response = await fetch(url, { method: "DELETE" });
  return ensureSuccess(response);
}
