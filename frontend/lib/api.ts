export type ProcessingStep = {
    name: string;
    status: "complete" | "in-progress" | "pending" | "error";
    details: string;
    timestamp?: string;
};

export type IntentClassification = {
    intent: "alert_creation" | "search_retrieval";
    confidence: number;
    reasoning: string;
};

export type ChatSendResponse = {
    session_id: string;
    parsed_filter: Record<string, any>;
    results: Array<{
        camera_id: number;
        timestamp?: string;
        start?: string;
        end?: string;
        clip_url?: string;
        score?: number;
        source?: string;
        objects?: Array<{
            object_name: string;
            track_id: number;
            confidence: number;
            color?: string;
            person_attributes?: Record<string, any>;
        }>;
    }>;
    answer: string;
    metadata?: Record<string, any>;
    alert_created?: Record<string, any>;
    processing_steps?: ProcessingStep[];
    // Additional fields for hybrid/semantic search
    semantic_results?: Array<{
        camera_id: number;
        timestamp?: string;
        start?: string;
        end?: string;
        clip_url?: string;
        score?: number;
        score_norm?: number;
        source?: string;
        frames?: Array<{
            frame_ts?: string;
            [key: string]: any;
        }>;
        duration_seconds?: number;
        objects?: Array<{
            object_name: string;
            track_id: number;
            confidence: number;
            color?: string;
            person_attributes?: Record<string, any>;
        }>;
        [key: string]: any;
    }>;
    mode?: string; // "structured" | "unstructured" | "hybrid"
    combined_tracks?: Array<Record<string, any>>;
    merged_tracks?: Array<Record<string, any>>;
};

export const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:8000";

async function http<T>(path: string, init?: RequestInit, timeoutMs: number = 30000): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(`${API_BASE}${path}`, {
            ...init,
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                ...(init?.headers || {}),
            },
            cache: "no-store",
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
        }
        return res.json() as Promise<T>;
    } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeoutMs}ms`);
        }
        throw error;
    }
}

export const api = {
    health: () => http<{ status: string; version: string }>("/health"),

    // Chat
    chatSend: (sessionId: string, message: string, limit = 50) =>
        http<ChatSendResponse>("/api/chat/send", {
            method: "POST",
            body: JSON.stringify({
                session_id: sessionId,
                message,
                limit,
            }),
        }),

    chatClassifyIntent: (message: string) =>
        http<IntentClassification>("/api/chat/classify-intent", {
            method: "POST",
            body: JSON.stringify({ message }),
        }, 10000), // 10 second timeout for LLM classification

    chatHistory: (sessionId: string) =>
        http<{ session_id: string; messages: Array<{ role: string; content: string; created_at: string; payload?: any }> }>(
            `/api/chat/history?session_id=${encodeURIComponent(sessionId)}`
        ),
    chatSessions: () =>
        http<Array<{ session_id: string; last_message?: string; last_message_time?: string; message_count: number }>>(
            "/api/chat/sessions"
        ),

    // Cameras
    listCameras: () => http<Array<Record<string, any>>>("/api/cameras/"),
    registerCamera: (payload: { camera_id: number; source: number | string; location?: string }) =>
        http<{ ok: boolean; camera_id: number }>("/api/cameras/register", {
            method: "POST",
            body: JSON.stringify(payload),
        }),
    startCamera: (cameraId: number, payload?: { source?: number | string; location?: string; show_window?: boolean; check?: boolean }) =>
        http<{ ok: boolean; camera_id: number; running: boolean }>(`/api/cameras/${cameraId}/start`, {
            method: "POST",
            body: JSON.stringify(payload || {}),
        }),
    stopCamera: (cameraId: number) =>
        http<{ ok: boolean; camera_id: number; running: boolean }>(`/api/cameras/${cameraId}/stop`, {
            method: "POST",
        }),
    deleteCamera: (cameraId: number) =>
        http<{ ok: boolean; camera_id: number; message: string }>(`/api/cameras/${cameraId}`, {
            method: "DELETE",
        }),
    probeCamera: (source: string | number, timeout = 8) => {
        const src = typeof source === "number" ? String(source) : source;
        const p = new URLSearchParams();
        p.set("source", src);
        p.set("timeout", String(timeout));
        return http<{ ok: boolean; message: string }>(`/api/cameras/probe?${p.toString()}`);
    },
    listZones: (cameraId: number) =>
        http<Array<{ zone_id: string; name: string; bbox?: Record<string, number>; capacity?: number; area_sqm?: number }>>(
            `/api/cameras/${cameraId}/zones`
        ),
    getOccupancy: (cameraId: number) =>
        http<{
            camera_id: number;
            person_count: number;
            zone_counts: Record<string, number>;
            zones: Array<{ zone_id: string; name: string; count: number; capacity?: number; occupancy_pct?: number }>;
            latest_timestamp?: string;
        }>(`/api/cameras/${cameraId}/occupancy`),

    // Detections
    listDetections: (params: URLSearchParams) =>
        http<Array<Record<string, any>>>(`/api/detections/?${params.toString()}`),
    objectCounts: (opts?: { camera_id?: number; from?: string; to?: string; last_minutes?: number; top_n?: number }) => {
        const p = new URLSearchParams();
        if (opts?.camera_id != null) p.set("camera_id", String(opts.camera_id));
        if (opts?.from) p.set("from", opts.from);
        if (opts?.to) p.set("to", opts.to);
        if (opts?.last_minutes != null) p.set("last_minutes", String(opts.last_minutes));
        if (opts?.top_n != null) p.set("top_n", String(opts.top_n));
        return http<Array<{ object_name: string; count: number }>>(`/api/detections/object-counts?${p.toString()}`);
    },
    colorCounts: (opts?: { camera_id?: number; object?: string; from?: string; to?: string; last_minutes?: number; top_n?: number }) => {
        const p = new URLSearchParams();
        if (opts?.camera_id != null) p.set("camera_id", String(opts.camera_id));
        if (opts?.object) p.set("object", opts.object);
        if (opts?.from) p.set("from", opts.from);
        if (opts?.to) p.set("to", opts.to);
        if (opts?.last_minutes != null) p.set("last_minutes", String(opts.last_minutes));
        if (opts?.top_n != null) p.set("top_n", String(opts.top_n));
        return http<Array<{ color: string; count: number }>>(`/api/detections/colors?${p.toString()}`);
    },

    // Alerts
    listAlerts: () => http<Array<Record<string, any>>>("/api/alerts/"),
    createAlert: (payload: Record<string, any>) =>
        http<Record<string, any>>("/api/alerts/", { method: "POST", body: JSON.stringify(payload) }),
    evaluateAlerts: () => http<Record<string, any>>("/api/alerts/evaluate", { method: "POST" }),
    listAlertLogs: () => http<Array<Record<string, any>>>("/api/alerts/logs"),
    deleteAlert: (alertId: string) =>
        http<{ ok: boolean }>(`/api/alerts/${alertId}`, { method: "DELETE" }),
    evaluateAlert: (alertId: string) =>
        http<Record<string, any>>(`/api/alerts/${alertId}/evaluate`, { method: "POST" }),

    // Alerts SSE stream (Server-Sent Events)
    streamAlerts: (opts?: { camera_id?: number; last_ts?: string }) => {
        const p = new URLSearchParams();
        if (opts?.camera_id != null) p.set("camera_id", String(opts.camera_id));
        if (opts?.last_ts) p.set("last_ts", opts.last_ts);
        const url = `${API_BASE}/api/alerts/stream?${p.toString()}`;
        return new EventSource(url);
    },

    // Videos/media
    listRecordings: () => http<Array<Record<string, any>>>("/api/videos/recordings"),
    listClips: () => http<Array<Record<string, any>>>("/api/videos/clips"),
    listSnapshots: () => http<Array<Record<string, any>>>("/api/videos/snapshots"),

    // Frame-level details for a specific clip
    listClipFrames: (clip_path: string, limit: number = 500, enrich?: "yolo") => {
        const p = new URLSearchParams();
        p.set("clip_path", clip_path);
        p.set("limit", String(limit));
        if (enrich) p.set("enrich", enrich);
        return http<Array<Record<string, any>>>(`/api/videos/frames?${p.toString()}`);
    },

    // Video upload + indexing
    uploadVideo: async (
        file: File,
        opts?: { camera_id?: number; every_sec?: number; with_captions?: boolean }
    ): Promise<{
        ok: boolean;
        camera_id: number;
        clip_path: string;
        clip_url: string | null;
        indexing: Record<string, any>;
    }> => {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("camera_id", String(opts?.camera_id ?? 99));
        fd.append("every_sec", String(opts?.every_sec ?? 1.0));
        fd.append("with_captions", String(!!opts?.with_captions));

        const res = await fetch(`${API_BASE}/api/videos/upload`, {
            method: "POST",
            body: fd,
            // note: do NOT set Content-Type; browser sets multipart boundary automatically
            cache: "no-store",
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
        }
        return res.json();
    },

    // Settings
    getIndexingMode: () =>
        http<{ indexing_mode: "structured" | "semantic" | "both" }>("/api/settings/indexing-mode"),
    setIndexingMode: (mode: "structured" | "semantic" | "both") =>
        http<{ indexing_mode: "structured" | "semantic" | "both" }>("/api/settings/indexing-mode", {
            method: "PUT",
            body: JSON.stringify({ indexing_mode: mode }),
        }),
    getLlmConfig: () =>
        http<{ provider: string; model: string; api_key: string }>("/api/settings/llm-config"),
    setLlmConfig: (config: { provider: string; model: string; api_key: string }) =>
        http<{ provider: string; model: string; api_key: string }>("/api/settings/llm-config", {
            method: "PUT",
            body: JSON.stringify(config),
        }),
    resetSystem: () => http<{ status: string; message: string }>("/api/settings/reset", { method: "DELETE" }),

    // Dashboard
    getAnomalies: (opts?: { date?: string; threshold?: number; baseline_days?: number }) => {
        const p = new URLSearchParams();
        if (opts?.date) p.set("date", opts.date);
        if (opts?.threshold != null) p.set("threshold", String(opts.threshold));
        if (opts?.baseline_days != null) p.set("baseline_days", String(opts.baseline_days));
        return http<{
            date: string;
            count: number;
            events: Array<{
                type: string;
                hour?: number | null;
                actual_count: number;
                baseline_mean?: number;
                z_score?: number | null;
                severity: string;
                description: string;
                cameras?: Record<string, number>;
            }>;
            baseline_days: number;
            z_threshold: number;
        }>(`/api/dashboard/anomalies?${p.toString()}`);
    },

    // ── EPS05 Intelligence Endpoints ─────────────────────────
    searchQuery: (payload: { conversation_id: string; query: string; limit?: number; video_id?: string; camera_id?: string }) =>
        http<{
            conversation_id: string;
            interpreted_query: Record<string, any>;
            clarification_required: boolean;
            clarification_question?: string | null;
            results: Array<{
                result_id: string;
                camera_id: string;
                camera_name: string;
                video_id: string;
                timestamp_seconds: number;
                timestamp: string;
                object_class: string;
                confidence: number;
                semantic_score: number;
                evidence_url?: string;
                crop_url?: string;
                video_url?: string;
                video_offset: number;
                detection_id?: string;
                identity_id?: string;
                explanation: string;
            }>;
            answer: string;
            latency_ms: number;
            evidence: Array<Record<string, any>>;
        }>("/api/search/query", {
            method: "POST",
            body: JSON.stringify(payload),
        }),

    registerVideo: (payload: { camera_id: string; camera_name: string; file_path: string; video_id?: string; start_time?: string }) =>
        http<Record<string, any>>("/api/videos/register", {
            method: "POST",
            body: JSON.stringify(payload),
        }),

    uploadCctvVideo: (formData: FormData, onProgress?: (pct: number, loaded: number, total: number) => void) => {
        return new Promise<Record<string, any>>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", `${API_BASE}/api/videos/upload`);
            if (xhr.upload && onProgress) {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const pct = Math.round((e.loaded / e.total) * 100);
                        onProgress(pct, e.loaded, e.total);
                    }
                };
            }
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (err) {
                        resolve({ ok: true });
                    }
                } else {
                    try {
                        const errObj = JSON.parse(xhr.responseText);
                        const msg = errObj.error?.message || errObj.detail || errObj.message || `Upload failed with HTTP ${xhr.status}`;
                        reject(new Error(msg));
                    } catch {
                        reject(new Error(`Upload failed with HTTP ${xhr.status}`));
                    }
                }
            };
            xhr.onerror = () => reject(new Error("Network error during upload"));
            xhr.send(formData);
        });
    },

    listRegisteredVideos: (camera_id?: string) => {
        const p = new URLSearchParams();
        if (camera_id) p.set("camera_id", camera_id);
        return http<Array<Record<string, any>>>(`/api/videos?${p.toString()}`);
    },

    getVideoDetails: (videoId: string) =>
        http<Record<string, any>>(`/api/videos/${videoId}`),

    getVideoStatus: (videoId: string) =>
        http<{ video_id: string; processing_status: string; processing_progress: number; error?: string }>(`/api/videos/${videoId}/status`),

    processVideo: (videoId: string, sampling_interval_sec: number = 1.0) =>
        http<{ ok: boolean; video_id: string; status: string }>(`/api/videos/${videoId}/process`, {
            method: "POST",
            body: JSON.stringify({ sampling_interval_sec }),
        }),

    stopVideo: (videoId: string) =>
        http<{ ok: boolean; video_id: string }>(`/api/videos/${videoId}/stop`, { method: "POST" }),

    deleteVideo: (videoId: string) =>
        http<{ ok: boolean; video_id: string }>(`/api/videos/${videoId}`, { method: "DELETE" }),

    seekVideo: (videoId: string, timestamp: number) =>
        http<{
            video_id: string;
            camera_id: string;
            camera_name: string;
            timestamp_seconds: number;
            timestamp_formatted: string;
            video_url: string;
            duration_seconds: number;
        }>(`/api/videos/${videoId}/seek?timestamp=${timestamp}`),

    listIdentities: (limit = 50) =>
        http<Array<{ identity_id: string; created_at: string; first_camera: string; total_observations: number }>>(`/api/identities?limit=${limit}`),

    getIdentityJourney: (identityId: str) =>
        http<{
            identity_id: string;
            observation_count: number;
            start_time: string;
            end_time: string;
            cameras_visited: string[];
            route: string;
            timeline: Array<{
                step: number;
                camera_id: string;
                video_id: string;
                timestamp_seconds: number;
                timestamp: string;
                evidence_url?: string;
                confidence: number;
                next_camera?: string;
                travel_time_seconds?: number;
            }>;
            journey_summary: string;
        }>(`/api/identities/${identityId}/journey`),

    runEvaluation: (mode = "PROPOSED") =>
        http<{
            eval_run_id: string;
            mode: string;
            timestamp: string;
            total_queries: number;
            top1_accuracy: number;
            top5_accuracy: number;
            camera_localization_accuracy: number;
            mean_timestamp_error_sec: number;
            mean_query_latency_ms: number;
            details: Array<Record<string, any>>;
        }>("/api/evaluation/run", {
            method: "POST",
            body: JSON.stringify({ mode }),
        }),

    getEvaluationResults: () =>
        http<Array<Record<string, any>>>("/api/evaluation/results"),

    getSystemStatus: () =>
        http<{
            backend: string;
            version: string;
            database: Record<string, any>;
            models: Record<string, string>;
            vector_index: string;
            video_processing: {
                active_jobs_count: number;
                jobs: Array<{ video_id: string; status: string }>;
            };
        }>("/api/system/status"),

    getSystemModels: () =>
        http<Record<string, string>>("/api/system/models"),
};

