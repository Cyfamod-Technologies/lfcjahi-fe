"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import AdminShell from "../components/admin-shell";
import styles from "../admin-pages.module.css";
import {
  MediaCategory,
  MediaItem,
  getCategoryNames,
  loadCategoryTree,
  loadMediaItems,
  saveCategoryTree,
  saveMediaItems,
} from "../lib/admin-store";
import {
  deleteMediaItemApi,
  fetchCategoriesApi,
  fetchMediaItemsApi,
  updateMediaPublishStatusApi,
} from "../lib/admin-api";

type SortMode = "newest" | "oldest" | "speaker" | "category";

type QueryStatus = "" | "created" | "updated" | "bulk-created";

const MONTH_OPTIONS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function parseItemDate(item: MediaItem): Date | null {
  const candidate = item.mediaDate || item.createdAt;

  if (!candidate) {
    return null;
  }

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? `${candidate}T00:00:00` : candidate;
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getOrdinalSuffix(day: number): string {
  const remainder = day % 100;

  if (remainder >= 11 && remainder <= 13) {
    return "th";
  }

  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function formatTableDate(item: MediaItem): string {
  const date = parseItemDate(item);

  if (!date) {
    return "-";
  }

  const day = date.getDate();
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const year = date.getFullYear();

  return `${day}${getOrdinalSuffix(day)} ${month} ${year}`;
}

function subscribeLocation(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function getQueryStatusClientSnapshot(): QueryStatus {
  if (typeof window === "undefined") {
    return "";
  }

  const status = new URLSearchParams(window.location.search).get("status");
  if (status === "created" || status === "updated" || status === "bulk-created") {
    return status;
  }

  return "";
}

function getQueryStatusServerSnapshot(): QueryStatus {
  return "";
}

export default function AdminMediaLibraryPage() {
  const router = useRouter();

  const [mediaItems, setMediaItems] = useState(loadMediaItems);
  const [categoryTree, setCategoryTree] = useState(loadCategoryTree);
  const [actionStatus, setActionStatus] = useState("");
  const queryStatus = useSyncExternalStore(
    subscribeLocation,
    getQueryStatusClientSnapshot,
    getQueryStatusServerSnapshot,
  );

  const [filterCategory, setFilterCategory] = useState<"All" | MediaCategory>("All");
  const [filterSpeaker, setFilterSpeaker] = useState("All");
  const [filterYear, setFilterYear] = useState("All");
  const [filterMonth, setFilterMonth] = useState("All");
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  useEffect(() => {
    let isActive = true;

    async function hydrateFromApi() {
      try {
        const [remoteMediaItems, remoteCategories] = await Promise.all([
          fetchMediaItemsApi(),
          fetchCategoriesApi(),
        ]);

        if (!isActive) {
          return;
        }

        if (remoteMediaItems) {
          setMediaItems(remoteMediaItems);
          saveMediaItems(remoteMediaItems);
        }

        if (remoteCategories && remoteCategories.length > 0) {
          setCategoryTree(remoteCategories);
          saveCategoryTree(remoteCategories);
        }
      } catch {
        // keep local fallback state
      }
    }

    void hydrateFromApi();

    return () => {
      isActive = false;
    };
  }, []);

  const speakers = useMemo(() => {
    const values = mediaItems
      .map((item) => item.speaker.trim())
      .filter(Boolean)
      .filter((value, index, source) => source.indexOf(value) === index)
      .sort((a, b) => a.localeCompare(b));
    return values;
  }, [mediaItems]);

  const categoryFilters = useMemo(() => {
    const configured = getCategoryNames(categoryTree);
    const usedByMedia = mediaItems
      .map((item) => item.category)
      .filter(Boolean)
      .filter((value, index, source) => source.indexOf(value) === index);

    return [...new Set([...configured, ...usedByMedia])].sort((a, b) => a.localeCompare(b));
  }, [categoryTree, mediaItems]);

  const mediaItemsWithDate = useMemo(
    () =>
      mediaItems.map((item) => {
        const date = parseItemDate(item);

        return {
          item,
          timestamp: date?.getTime() ?? 0,
          year: date ? String(date.getFullYear()) : "",
          month: date ? String(date.getMonth()) : "",
        };
      }),
    [mediaItems],
  );

  const yearFilters = useMemo(() => {
    return mediaItemsWithDate
      .map((entry) => entry.year)
      .filter(Boolean)
      .filter((value, index, source) => source.indexOf(value) === index)
      .sort((a, b) => Number(b) - Number(a));
  }, [mediaItemsWithDate]);

  const filteredItems = useMemo(() => {
    const output = mediaItemsWithDate.filter(({ item, year, month }) => {
      const matchesCategory = filterCategory === "All" || item.category === filterCategory;
      const matchesSpeaker = filterSpeaker === "All" || item.speaker === filterSpeaker;
      const matchesYear = filterYear === "All" || year === filterYear;
      const matchesMonth = filterMonth === "All" || month === filterMonth;

      return matchesCategory && matchesSpeaker && matchesYear && matchesMonth;
    });

    output.sort((a, b) => {
      if (sortMode === "oldest") {
        return a.timestamp - b.timestamp;
      }

      if (sortMode === "speaker") {
        return a.item.speaker.localeCompare(b.item.speaker);
      }

      if (sortMode === "category") {
        return a.item.category.localeCompare(b.item.category);
      }

      return b.timestamp - a.timestamp;
    });

    return output.map((entry) => entry.item);
  }, [filterCategory, filterMonth, filterSpeaker, filterYear, mediaItemsWithDate, sortMode]);

  async function handleDelete(item: MediaItem) {
    const confirmed = window.confirm(`Delete '${item.title}'?`);
    if (!confirmed) {
      return;
    }

    const nextItems = mediaItems.filter((entry) => entry.id !== item.id);
    setMediaItems(nextItems);
    saveMediaItems(nextItems);

    try {
      await deleteMediaItemApi(item.id);
    } catch {
      // keep local delete even if API fails
    }

    setActionStatus(`Deleted '${item.title}'.`);
  }

  async function handlePublishToggle(item: MediaItem, nextPublished: boolean) {
    const previousItems = mediaItems;
    const optimisticItems = mediaItems.map((entry) =>
      entry.id === item.id
        ? {
            ...entry,
            isPublished: nextPublished,
          }
        : entry,
    );

    setMediaItems(optimisticItems);
    saveMediaItems(optimisticItems);

    try {
      const updated = await updateMediaPublishStatusApi(item.id, nextPublished);
      if (updated) {
        const nextItems = optimisticItems.map((entry) => (entry.id === updated.id ? updated : entry));
        setMediaItems(nextItems);
        saveMediaItems(nextItems);
      }
      setActionStatus(
        nextPublished ? `Published '${item.title}'.` : `Unpublished '${item.title}'.`,
      );
    } catch {
      setMediaItems(previousItems);
      saveMediaItems(previousItems);
      setActionStatus("Could not update publish status. Please try again.");
    }
  }

  const status =
    actionStatus ||
    (queryStatus === "created"
      ? "Media added successfully."
      : queryStatus === "updated"
        ? "Media updated successfully."
        : queryStatus === "bulk-created"
          ? "Bulk media added successfully."
        : "");

  return (
    <AdminShell title="Media Library">
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Media Manager</h2>
        <p className={styles.panelText}>
          Manage and categorize media files including sermon videos, audio, photos, and downloads.
        </p>

        <div className={styles.inlineActions}>
          <Link className={styles.buttonPrimary} href="/admin/media-library/new">
            Add New Media
          </Link>
          <Link className={styles.buttonSecondary} href="/admin/media-library/bulk">
            Bulk Add Media
          </Link>
          <Link className={styles.buttonSecondary} href="/admin/categories">
            Manage Categories
          </Link>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Sort and Filter</h2>
        <div className={styles.filtersGrid}>
          <div className={styles.field}>
            <label htmlFor="filterCategory">Category</label>
            <select
              id="filterCategory"
              value={filterCategory}
              onChange={(event) =>
                setFilterCategory(event.target.value === "All" ? "All" : (event.target.value as MediaCategory))
              }
            >
              <option value="All">All Categories</option>
              {categoryFilters.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="filterSpeaker">Speaker</label>
            <select
              id="filterSpeaker"
              value={filterSpeaker}
              onChange={(event) => setFilterSpeaker(event.target.value)}
            >
              <option value="All">All Speakers</option>
              {speakers.map((speakerName) => (
                <option key={speakerName} value={speakerName}>
                  {speakerName}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="filterYear">Year</label>
            <select id="filterYear" value={filterYear} onChange={(event) => setFilterYear(event.target.value)}>
              <option value="All">All Years</option>
              {yearFilters.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="filterMonth">Month</label>
            <select id="filterMonth" value={filterMonth} onChange={(event) => setFilterMonth(event.target.value)}>
              <option value="All">All Months</option>
              {MONTH_OPTIONS.map((monthName, index) => (
                <option key={monthName} value={String(index)}>
                  {monthName}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="sortMode">Sort</label>
            <select id="sortMode" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="speaker">Speaker</option>
              <option value="category">Category</option>
            </select>
          </div>

          <div className={styles.field}>
            <label>Total Media</label>
            <input value={String(filteredItems.length)} readOnly />
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Media Items</h2>
        {filteredItems.length === 0 ? (
          <p className={styles.emptyState}>No media matches your filters yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Title</th>
                  <th>Date</th>
                  <th>Post Image</th>
                  <th>Speaker</th>
                  <th>Downloads</th>
                  <th>Play</th>
                  <th>Publish</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td>{item.title}</td>
                    <td>{formatTableDate(item)}</td>
                    <td>
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.title}
                          style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8 }}
                        />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{item.speaker || "-"}</td>
                    <td>{item.downloadCount}</td>
                    <td>
                      {item.mediaUrl ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                          <audio controls preload="none" src={item.mediaUrl} style={{ width: 170 }}>
                            Your browser does not support audio playback.
                          </audio>
                          {/* <a
                            className={styles.downloadLink}
                            href={item.mediaUrl}
                            download={item.title || true}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            &#x2913; Download
                          </a> */}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={item.isPublished !== false}
                          onChange={(event) => void handlePublishToggle(item, event.target.checked)}
                        />
                        <span>{item.isPublished !== false ? "On" : "Off"}</span>
                      </label>
                    </td>
                    <td>
                      <div className={styles.listActions}>
                        <button
                          className={styles.buttonSecondary}
                          type="button"
                          onClick={() => router.push(`/admin/media-library/edit/${item.id}`)}
                        >
                          Edit
                        </button>
                        <button className={styles.buttonDanger} type="button" onClick={() => void handleDelete(item)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {status ? <p className={styles.status}>{status}</p> : null}
    </AdminShell>
  );
}
