"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../../admin-pages.module.css";
import AdminShell from "../../components/admin-shell";
import {
  MediaCategory,
  MediaItem,
  SpeakerItem,
  createId,
  getCategoryNames,
  getSpeakerImageUrl,
  getSpeakerNames,
  loadCategoryTree,
  loadMediaItems,
  loadSpeakers,
  saveCategoryTree,
  saveMediaItems,
  saveSpeakers,
  SERVICE_OPTIONS,
} from "../../lib/admin-store";
import {
  fetchCategoriesApi,
  fetchMediaItemsApi,
  fetchSpeakersApi,
  hasApiBaseUrl,
  isLikelyNetworkError,
  saveMediaItemApi,
} from "../../lib/admin-api";
import { parseMediaMetadataFromFilename } from "../../lib/media-filename";

type AudioSourceMode = "link" | "file";

type BulkMediaRow = {
  id: string;
  speaker: string;
  service: string;
  title: string;
  description: string;
  mediaDate: string;
  thumbnailFile: File | null;
  thumbnailPreviewUrl: string;
  audioSourceMode: AudioSourceMode;
  audioLink: string;
  audioFile: File | null;
};

function createEmptyRow(): BulkMediaRow {
  return {
    id: createId("bulk-media"),
    speaker: "",
    service: "",
    title: "",
    description: "",
    mediaDate: "",
    thumbnailFile: null,
    thumbnailPreviewUrl: "",
    audioSourceMode: "link",
    audioLink: "",
    audioFile: null,
  };
}

function rowHasContent(row: BulkMediaRow): boolean {
  return [
    row.speaker,
    row.service,
    row.title,
    row.description,
    row.mediaDate,
    row.audioLink,
    row.audioFile?.name || "",
    row.thumbnailFile?.name || "",
  ].some((value) => String(value || "").trim());
}

function isAudioCategory(category: string): boolean {
  return category.trim().toLowerCase() === "audio";
}

function pickDefaultCategory(categoryOptions: string[]): string {
  const audioCategory = categoryOptions.find((entry) => entry.trim().toLowerCase() === "audio");
  return audioCategory || categoryOptions[0] || "Audio";
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function formatLongDate(value: string): string {
  if (!value) {
    return "";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function ensurePastorLabel(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    return "the pastor";
  }

  if (/^(pastor|pst|bishop|dr|rev|apostle|evang|evangelist|minister|dcn|deacon)\b/i.test(normalized)) {
    return normalized;
  }

  return `Pastor ${normalized}`;
}

function buildAutoDescription(service: string, speaker: string, mediaDate: string): string {
  const serviceText = service.trim() || "service";
  const speakerText = ensurePastorLabel(speaker);
  const dateText = formatLongDate(mediaDate) || mediaDate || "the scheduled date";

  return `This is a ${serviceText} message by ${speakerText} preached on ${dateText}. Faith cometh by hearing and hearing, so listen and be blessed.`;
}

export default function AdminBulkMediaPage() {
  const router = useRouter();

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [speakers, setSpeakers] = useState<SpeakerItem[]>(loadSpeakers);
  const [category, setCategory] = useState<MediaCategory>("");
  const [isPublished, setIsPublished] = useState(true);
  const [rows, setRows] = useState<BulkMediaRow[]>([createEmptyRow(), createEmptyRow(), createEmptyRow()]);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let isActive = true;

    async function initializePage() {
      let nextCategoryTree = loadCategoryTree();
      let nextMediaItems = loadMediaItems();
      let nextSpeakers = loadSpeakers();

      try {
        const [remoteCategories, remoteMediaItems, remoteSpeakers] = await Promise.all([
          fetchCategoriesApi(),
          fetchMediaItemsApi(),
          fetchSpeakersApi(),
        ]);

        if (!isActive) {
          return;
        }

        if (remoteCategories && remoteCategories.length > 0) {
          nextCategoryTree = remoteCategories;
          saveCategoryTree(remoteCategories);
        }

        if (remoteMediaItems) {
          nextMediaItems = remoteMediaItems;
          saveMediaItems(remoteMediaItems);
        }

        if (remoteSpeakers) {
          nextSpeakers = remoteSpeakers;
          saveSpeakers(remoteSpeakers);
        }
      } catch {
        // keep local fallback state
      }

      if (!isActive) {
        return;
      }

      const categoryNames = getCategoryNames(nextCategoryTree);
      const fallbackCategory = pickDefaultCategory(categoryNames);

      setMediaItems(nextMediaItems);
      setSpeakers(nextSpeakers);
      setCategory(fallbackCategory);
      setIsReady(true);
    }

    void initializePage();

    return () => {
      isActive = false;
    };
  }, []);

  const speakerOptions = useMemo(() => getSpeakerNames(speakers), [speakers]);
  const serviceOptions = useMemo(() => SERVICE_OPTIONS, []);
  const audioCategorySelected = isAudioCategory(category);

  async function handleThumbnailSelection(rowId: string, file: File | null) {
    if (!file) {
      updateRow(rowId, {
        thumbnailFile: null,
        thumbnailPreviewUrl: "",
      });
      return;
    }

    try {
      const preview = await fileToDataUrl(file);
      updateRow(rowId, {
        thumbnailFile: file,
        thumbnailPreviewUrl: preview,
      });
    } catch {
      updateRow(rowId, {
        thumbnailFile: file,
        thumbnailPreviewUrl: "",
      });
    }
  }

  function updateRow(rowId: string, patch: Partial<BulkMediaRow>) {
    setRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? {
              ...row,
              ...patch,
            }
          : row,
      ),
    );
  }

  function applyAudioFilenameMetadata(row: BulkMediaRow, file: File | null) {
    if (!file) {
      updateRow(row.id, { audioFile: null });
      return;
    }

    const parsed = parseMediaMetadataFromFilename(file.name, speakerOptions);
    const patch: Partial<BulkMediaRow> = {
      audioFile: file,
    };

    if (!row.title.trim() && parsed.title) {
      patch.title = parsed.title;
    }

    if (!row.speaker.trim() && parsed.speaker) {
      patch.speaker = parsed.speaker;
    }

    if (!row.service.trim() && parsed.service) {
      patch.service = parsed.service;
    }

    if (!row.mediaDate.trim() && parsed.mediaDate) {
      patch.mediaDate = parsed.mediaDate;
    }

    if (!row.description.trim() && (patch.title || patch.speaker || patch.service || patch.mediaDate)) {
      patch.description = buildAutoDescription(
        patch.service || row.service,
        patch.speaker || row.speaker,
        patch.mediaDate || row.mediaDate,
      );
    }

    updateRow(row.id, patch);
  }

  function buildRowFromAudioFile(file: File): BulkMediaRow {
    const parsed = parseMediaMetadataFromFilename(file.name, speakerOptions);

    return {
      id: createId("bulk-media"),
      speaker: parsed.speaker,
      service: parsed.service,
      title: parsed.title,
      description:
        parsed.title || parsed.speaker || parsed.service || parsed.mediaDate
          ? buildAutoDescription(parsed.service, parsed.speaker, parsed.mediaDate)
          : "",
      mediaDate: parsed.mediaDate,
      thumbnailFile: null,
      thumbnailPreviewUrl: "",
      audioSourceMode: "file",
      audioLink: "",
      audioFile: file,
    };
  }

  function handleBulkAudioSelection(fileList: FileList | null) {
    const files = Array.from(fileList || []);

    if (files.length === 0) {
      return;
    }

    const nextRows = files.map((file) => buildRowFromAudioFile(file));

    setRows((current) => {
      const hasMeaningfulRows = current.some((row) => rowHasContent(row));
      return hasMeaningfulRows ? [...current, ...nextRows] : nextRows;
    });
    setStatus(`${files.length} audio file(s) added as rows. Cross-check the details before saving.`);
  }

  function addRow() {
    setRows((current) => [...current, createEmptyRow()]);
  }

  function removeRow(rowId: string) {
    setRows((current) => {
      if (current.length === 1) {
        return [createEmptyRow()];
      }

      return current.filter((row) => row.id !== rowId);
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    setStatus("");
    setUploadProgress(0);
    setProgressLabel("");

    if (!category.trim()) {
      setStatus("Please select a category.");
      return;
    }

    const activeRows = rows.filter((row) => rowHasContent(row));

    if (activeRows.length === 0) {
      setStatus("Add at least one media row.");
      return;
    }

    const audioCategory = isAudioCategory(category);
    const apiConfigured = hasApiBaseUrl();

    setIsSaving(true);

    const createdItems: MediaItem[] = [];
    const failedRows: Array<{ rowId: string; message: string }> = [];
    const totalRows = activeRows.length;
    let networkPauseMessage = "";
    let rowsToKeep = new Set<string>();

    function updateBatchProgress(rowIndex: number, rowPercent: number) {
      const normalized = Math.max(0, Math.min(100, rowPercent));
      const overall = Math.round(((rowIndex + normalized / 100) / totalRows) * 100);
      setUploadProgress(overall);
      setProgressLabel(`Saving item ${Math.min(rowIndex + 1, totalRows)} of ${totalRows}`);
    }

    for (const [index, row] of activeRows.entries()) {
      updateBatchProgress(index, 0);

      const speaker = row.speaker.trim();
      if (!speaker) {
        failedRows.push({ rowId: row.id, message: `Row ${index + 1}: speaker is required.` });
        updateBatchProgress(index, 100);
        continue;
      }

      const service = row.service.trim();
      if (!service) {
        failedRows.push({ rowId: row.id, message: `Row ${index + 1}: service is required.` });
        updateBatchProgress(index, 100);
        continue;
      }

      const title = row.title.trim();
      if (!title) {
        failedRows.push({ rowId: row.id, message: `Row ${index + 1}: title is required.` });
        updateBatchProgress(index, 100);
        continue;
      }

      let resolvedMediaUrl = "";
      let resolvedMediaSourceType: "link" | "file" | "" = "";
      let resolvedThumbnailUrl = "";

      if (row.thumbnailFile && !apiConfigured) {
        try {
          resolvedThumbnailUrl = await fileToDataUrl(row.thumbnailFile);
        } catch {
          failedRows.push({ rowId: row.id, message: `Row ${index + 1}: failed to read thumbnail image.` });
          updateBatchProgress(index, 100);
          continue;
        }
      }

      if (audioCategory) {
        resolvedMediaSourceType = row.audioSourceMode;

        if (row.audioSourceMode === "link") {
          if (!row.audioLink.trim()) {
            failedRows.push({ rowId: row.id, message: `Row ${index + 1}: audio link is required.` });
            updateBatchProgress(index, 100);
            continue;
          }

          resolvedMediaUrl = row.audioLink.trim();
        } else {
          if (!row.audioFile) {
            failedRows.push({ rowId: row.id, message: `Row ${index + 1}: audio file is required.` });
            updateBatchProgress(index, 100);
            continue;
          }

          if (!apiConfigured) {
            try {
              resolvedMediaUrl = await fileToDataUrl(row.audioFile);
            } catch {
              failedRows.push({ rowId: row.id, message: `Row ${index + 1}: failed to read audio file.` });
              updateBatchProgress(index, 100);
              continue;
            }
          }
        }
      }

      const localFallbackItem: MediaItem = {
        id: createId("media"),
        title,
        description: row.description.trim(),
        category,
        subcategory: service,
        speaker,
        mediaDate: row.mediaDate.trim(),
        thumbnailUrl: resolvedThumbnailUrl || getSpeakerImageUrl(speakers, speaker),
        customThumbnailUrl: resolvedThumbnailUrl,
        speakerImageUrl: getSpeakerImageUrl(speakers, speaker),
        mediaUrl: resolvedMediaUrl,
        downloadCount: 0,
        mediaSourceType: resolvedMediaSourceType,
        isPublished,
        createdAt: new Date().toISOString(),
      };

      try {
        const remoteItem = await saveMediaItemApi(
          {
            title: localFallbackItem.title,
            description: localFallbackItem.description,
            category: localFallbackItem.category,
            subcategory: localFallbackItem.subcategory,
            speaker: localFallbackItem.speaker,
            mediaDate: localFallbackItem.mediaDate,
            mediaSourceType: localFallbackItem.mediaSourceType || "",
            mediaUrl: resolvedMediaUrl,
            thumbnailUrl: resolvedThumbnailUrl,
            thumbnailFile: row.thumbnailFile,
            audioFile: row.audioFile,
            isPublished,
          },
          undefined,
          (percent) => updateBatchProgress(index, percent),
        );

        if (remoteItem) {
          createdItems.push(remoteItem);
        } else if (!apiConfigured) {
          createdItems.push(localFallbackItem);
        } else {
          failedRows.push({ rowId: row.id, message: `Row ${index + 1}: unable to save on the server.` });
        }
      } catch (error) {
        if (!apiConfigured) {
          createdItems.push(localFallbackItem);
        } else {
          if (isLikelyNetworkError(error)) {
            rowsToKeep = new Set(activeRows.slice(index).map((entry) => entry.id));
            networkPauseMessage = `${createdItems.length} item(s) added before the connection dropped while saving row ${index + 1}. The unsaved rows are still in the form. Restore the network and click save again to continue.`;
            updateBatchProgress(index, 100);
            break;
          }

          failedRows.push({
            rowId: row.id,
            message: `Row ${index + 1}: ${error instanceof Error ? error.message : "save failed."}`,
          });
        }
      }

      updateBatchProgress(index, 100);
    }

    if (createdItems.length > 0) {
      const nextMediaItems = [...createdItems, ...mediaItems];
      setMediaItems(nextMediaItems);
      saveMediaItems(nextMediaItems);
    }

    if (networkPauseMessage) {
      setRows((current) => current.filter((row) => !activeRows.some((entry) => entry.id === row.id) || rowsToKeep.has(row.id)));
      setStatus(networkPauseMessage);
      setProgressLabel(`Paused after saving ${createdItems.length} of ${totalRows} item(s)`);
      setIsSaving(false);
      return;
    }

    if (failedRows.length === 0) {
      setUploadProgress(100);
      setProgressLabel(`Saved ${totalRows} of ${totalRows} items`);
      router.push("/admin/media-library?status=bulk-created");
      return;
    }

    const failedIds = new Set(failedRows.map((entry) => entry.rowId));
    setRows((current) => current.filter((row) => failedIds.has(row.id)));
    setStatus(
      `${createdItems.length} item(s) added. ${failedRows.length} row(s) need attention: ${failedRows
        .map((entry) => entry.message)
        .join(" ")}`,
    );
    setUploadProgress(100);
    setProgressLabel(`Processed ${totalRows} of ${totalRows} items`);
    setIsSaving(false);
  }

  if (!isReady) {
    return (
      <AdminShell title="Bulk Add Media">
        <section className={styles.panel}>
          <p className={styles.panelText}>Loading bulk media form...</p>
        </section>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Bulk Add Media">
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Bulk Media Entry</h2>
        <p className={styles.panelText}>
          Create multiple media items with per-row service selections while keeping publish settings shared.
        </p>
        <div className={styles.inlineActions}>
          <Link className={styles.buttonSecondary} href="/admin/speakers">
            Manage Speakers
          </Link>
          <Link className={styles.buttonSecondary} href="/admin/media-library">
            Back to Media Library
          </Link>
        </div>
      </section>

      <section className={styles.panel}>
        <form className={styles.formGrid} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="bulkPublish">Publish</label>
            <select
              id="bulkPublish"
              value={isPublished ? "published" : "draft"}
              onChange={(event) => setIsPublished(event.target.value === "published")}
            >
              <option value="published">Published</option>
              <option value="draft">Unpublished</option>
            </select>
          </div>

          {audioCategorySelected ? (
            <div className={`${styles.uploadCard} ${styles.formGridFull}`}>
              <div className={styles.uploadHeader}>
                <h3 className={styles.uploadTitle}>Add Multiple Audio Files</h3>
                <p className={styles.uploadSubtext}>
                  Select many audio files at once and the system will create one review row per file.
                </p>
              </div>
              <input
                id="bulk-audio-multi"
                className={styles.hiddenFileInput}
                type="file"
                accept="audio/*"
                multiple
                onChange={(event) => {
                  handleBulkAudioSelection(event.target.files);
                  event.target.value = "";
                }}
              />
              <label htmlFor="bulk-audio-multi" className={styles.fileTrigger}>
                Choose Multiple Audio Files
              </label>
            </div>
          ) : null}

          <div className={`${styles.inlineActions} ${styles.formGridFull}`} style={{ justifyContent: "space-between" }}>
            <div>
              <h3 className={styles.panelTitle} style={{ fontSize: 18 }}>Item Rows</h3>
              <p className={styles.panelText} style={{ marginBottom: 0 }}>
                Fill one row per media item. Audio rows support either a link or a direct file upload.
              </p>
            </div>
            <button type="button" className={styles.buttonSecondary} onClick={addRow}>
              Add Row
            </button>
          </div>

          <div className={`${styles.formGridFull} ${styles.tableWrap}`}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {audioCategorySelected ? <th>Source</th> : null}
                  {audioCategorySelected ? <th>Audio Link / File</th> : null}
                  <th>Speaker</th>
                  <th>Service</th>
                  <th>Title</th>
                  <th>Date</th>
                  <th>Thumbnail</th>
                  <th>Description</th>
                  <th className={`${styles.stickyColumnRight} ${styles.stickyColumnHeader}`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id}>
                    {audioCategorySelected ? (
                      <td>
                        <div className={styles.toggleGroup}>
                          <button
                            type="button"
                            className={`${styles.toggleButton} ${
                              row.audioSourceMode === "link" ? styles.toggleButtonActive : ""
                            }`}
                            onClick={() => updateRow(row.id, { audioSourceMode: "link", audioFile: null })}
                          >
                            Link
                          </button>
                          <button
                            type="button"
                            className={`${styles.toggleButton} ${
                              row.audioSourceMode === "file" ? styles.toggleButtonActive : ""
                            }`}
                            onClick={() => updateRow(row.id, { audioSourceMode: "file", audioLink: "" })}
                          >
                            File
                          </button>
                        </div>
                      </td>
                    ) : null}
                    {audioCategorySelected ? (
                      <td>
                        {row.audioSourceMode === "link" ? (
                          <input
                            className={styles.inlineInput}
                            value={row.audioLink}
                            onChange={(event) => updateRow(row.id, { audioLink: event.target.value })}
                            placeholder="https://.../message.mp3"
                            style={{ minWidth: 260 }}
                          />
                        ) : (
                          <div className={styles.uploadCard} style={{ minWidth: 260 }}>
                            <input
                              id={`bulk-audio-${row.id}`}
                              className={styles.hiddenFileInput}
                              type="file"
                              accept="audio/*"
                              onChange={(event) =>
                                applyAudioFilenameMetadata(row, event.target.files?.[0] || null)
                              }
                            />
                            <label htmlFor={`bulk-audio-${row.id}`} className={styles.fileTrigger}>
                              Choose Audio File
                            </label>
                            <p className={styles.fileName}>{row.audioFile ? row.audioFile.name : "No file selected"}</p>
                          </div>
                        )}
                      </td>
                    ) : null}
                    <td>
                      <select
                        className={styles.inlineInput}
                        value={row.speaker}
                        onChange={(event) => updateRow(row.id, { speaker: event.target.value })}
                      >
                        <option value="">Select speaker</option>
                        {speakerOptions.map((speakerName) => (
                          <option key={speakerName} value={speakerName}>
                            {speakerName}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className={styles.inlineInput}
                        value={row.service}
                        onChange={(event) => updateRow(row.id, { service: event.target.value })}
                      >
                        <option value="">Select service</option>
                        {serviceOptions.map((serviceOption) => (
                          <option key={serviceOption} value={serviceOption}>
                            {serviceOption}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className={styles.inlineInput}
                        value={row.title}
                        onChange={(event) => updateRow(row.id, { title: event.target.value })}
                        placeholder={`Item ${index + 1} title`}
                      />
                    </td>
                    <td>
                      <input
                        className={styles.inlineInput}
                        type="date"
                        value={row.mediaDate}
                        onChange={(event) => updateRow(row.id, { mediaDate: event.target.value })}
                      />
                    </td>
                    <td>
                      <div className={styles.uploadCard} style={{ minWidth: 210 }}>
                        <input
                          id={`bulk-thumb-${row.id}`}
                          className={styles.hiddenFileInput}
                          type="file"
                          accept="image/*"
                          onChange={(event) => void handleThumbnailSelection(row.id, event.target.files?.[0] || null)}
                        />
                        <label htmlFor={`bulk-thumb-${row.id}`} className={styles.fileTrigger}>
                          Choose Image
                        </label>
                        {row.thumbnailFile ? (
                          <p className={styles.fileName}>{row.thumbnailFile.name}</p>
                        ) : (
                          <p className={styles.uploadSubtext}>No image selected</p>
                        )}
                        {row.thumbnailPreviewUrl ? (
                          <div className={styles.uploadPreviewWrap}>
                            <img
                              src={row.thumbnailPreviewUrl}
                              alt={`${row.title || `Item ${index + 1}`} thumbnail preview`}
                              className={styles.uploadPreview}
                            />
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <textarea
                        className={styles.inlineInput}
                        value={row.description}
                        onChange={(event) => updateRow(row.id, { description: event.target.value })}
                        placeholder="Optional description"
                        style={{ minWidth: 260, minHeight: 84 }}
                      />
                    </td>
                    <td className={styles.stickyColumnRight}>
                      <div className={styles.listActions}>
                        <button type="button" className={styles.buttonDanger} onClick={() => removeRow(row.id)}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={`${styles.inlineActions} ${styles.formGridFull}`}>
            <button className={styles.buttonPrimary} type="submit" disabled={isSaving || speakerOptions.length === 0}>
              {isSaving ? "Saving..." : "Save Bulk Media"}
            </button>
            <button type="button" className={styles.buttonSecondary} onClick={addRow}>
              Add Another Row
            </button>
          </div>

          {isSaving ? (
            <div className={`${styles.progressWrap} ${styles.formGridFull}`}>
              <p className={styles.progressLabel}>
                {progressLabel || "Saving bulk media..."} {uploadProgress}%
              </p>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          ) : null}
        </form>
      </section>

      {speakerOptions.length === 0 ? (
        <p className={styles.status}>Add at least one speaker before using bulk media entry.</p>
      ) : null}
      {status ? <p className={styles.status}>{status}</p> : null}
    </AdminShell>
  );
}
