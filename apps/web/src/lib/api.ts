/**
 * API Client for OppMon Backend
 *
 * Provides typed methods for all API endpoints with error handling.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data?: unknown,
  ) {
    super(`${status} ${statusText}`);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let data;
    try {
      data = await response.json();
    } catch {
      // Response may not be JSON
    }
    throw new ApiError(response.status, response.statusText, data);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

function getHeaders(token?: string): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

// ============================================
// Auth
// ============================================

export async function login(email: string, password: string) {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ email, password }),
  });
  return handleResponse<{ token: string; user: unknown }>(response);
}

export async function register(data: { email: string; password: string; name: string }) {
  const response = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<{ token: string; user: unknown }>(response);
}

export async function logout(token: string) {
  const response = await fetch(`${API_URL}/api/auth/logout`, {
    method: 'POST',
    headers: getHeaders(token),
  });
  return handleResponse<void>(response);
}

export async function getCurrentUser(token: string) {
  const response = await fetch(`${API_URL}/api/auth/me`, {
    headers: getHeaders(token),
  });
  return handleResponse<{ user: unknown }>(response);
}

// ============================================
// Agents
// ============================================

export async function listAgents(token: string, params?: { limit?: number; offset?: number; status?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));
  if (params?.status) searchParams.set('status', params.status);

  const response = await fetch(`${API_URL}/api/agents?${searchParams}`, {
    headers: getHeaders(token),
  });
  return handleResponse<{ data: unknown[]; total: number }>(response);
}

export async function getAgent(token: string, id: string) {
  const response = await fetch(`${API_URL}/api/agents/${id}`, {
    headers: getHeaders(token),
  });
  return handleResponse<unknown>(response);
}

export async function createAgent(token: string, data: { name: string; framework: string; description?: string }) {
  const response = await fetch(`${API_URL}/api/agents`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse<unknown>(response);
}

export async function updateAgent(token: string, id: string, data: Partial<{ name: string; framework: string; description: string }>) {
  const response = await fetch(`${API_URL}/api/agents/${id}`, {
    method: 'PUT',
    headers: getHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse<unknown>(response);
}

export async function deleteAgent(token: string, id: string) {
  const response = await fetch(`${API_URL}/api/agents/${id}`, {
    method: 'DELETE',
    headers: getHeaders(token),
  });
  return handleResponse<void>(response);
}

// ============================================
// Dashboard
// ============================================

export async function getDashboardOverview(token: string) {
  const response = await fetch(`${API_URL}/api/dashboard/overview`, {
    headers: getHeaders(token),
  });
  return handleResponse<{ agents: unknown[]; todayStats: unknown[]; timestamp: string }>(response);
}

export async function getDashboardActivity(token: string, params?: { limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));

  const response = await fetch(`${API_URL}/api/dashboard/activity?${searchParams}`, {
    headers: getHeaders(token),
  });
  return handleResponse<{ data: unknown[] }>(response);
}

export async function getDashboardTrends(token: string, days = 30) {
  const response = await fetch(`${API_URL}/api/dashboard/trends?days=${days}`, {
    headers: getHeaders(token),
  });
  return handleResponse<{ data: unknown[] }>(response);
}

// ============================================
// Costs
// ============================================

export async function getCostsOverview(token: string, period = '30d') {
  const response = await fetch(`${API_URL}/api/costs/overview?period=${period}`, {
    headers: getHeaders(token),
  });
  return handleResponse<{ summary: unknown; trend: unknown[] }>(response);
}

export async function getCostsByAgent(token: string, period = '30d') {
  const response = await fetch(`${API_URL}/api/costs/by-agent?period=${period}`, {
    headers: getHeaders(token),
  });
  return handleResponse<{ data: unknown[] }>(response);
}

export async function getCostsByModel(token: string, period = '30d') {
  const response = await fetch(`${API_URL}/api/costs/by-model?period=${period}`, {
    headers: getHeaders(token),
  });
  return handleResponse<{ data: unknown[] }>(response);
}

// ============================================
// Security
// ============================================

export async function getSecurityOverview(token: string) {
  const response = await fetch(`${API_URL}/api/security/overview`, {
    headers: getHeaders(token),
  });
  return handleResponse<{ threats: unknown[]; criticalEvents: unknown[]; anomalies: unknown[] }>(response);
}

export async function getSecurityThreats(token: string, params?: { level?: string; dismissed?: boolean }) {
  const searchParams = new URLSearchParams();
  if (params?.level) searchParams.set('level', params.level);
  if (params?.dismissed !== undefined) searchParams.set('dismissed', String(params.dismissed));

  const response = await fetch(`${API_URL}/api/security/threats?${searchParams}`, {
    headers: getHeaders(token),
  });
  return handleResponse<{ data: unknown[] }>(response);
}

export async function dismissThreat(token: string, id: string, reason?: string) {
  const response = await fetch(`${API_URL}/api/security/threats/${id}/dismiss`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ reason }),
  });
  return handleResponse<unknown>(response);
}

// ============================================
// Workflows
// ============================================

export async function listWorkflows(token: string, params?: { status?: string; limit?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const response = await fetch(`${API_URL}/api/workflows?${searchParams}`, {
    headers: getHeaders(token),
  });
  return handleResponse<{ data: unknown[] }>(response);
}

export async function getWorkflow(token: string, id: string) {
  const response = await fetch(`${API_URL}/api/workflows/${id}`, {
    headers: getHeaders(token),
  });
  return handleResponse<unknown>(response);
}

export async function runWorkflow(token: string, id: string, input?: Record<string, unknown>) {
  const response = await fetch(`${API_URL}/api/workflows/${id}/run`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ input }),
  });
  return handleResponse<unknown>(response);
}

// ============================================
// Incidents
// ============================================

export async function listIncidents(token: string, params?: { status?: string; severity?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.severity) searchParams.set('severity', params.severity);

  const response = await fetch(`${API_URL}/api/incidents?${searchParams}`, {
    headers: getHeaders(token),
  });
  return handleResponse<{ data: unknown[]; total: number }>(response);
}

export async function getIncident(token: string, id: string) {
  const response = await fetch(`${API_URL}/api/incidents/${id}`, {
    headers: getHeaders(token),
  });
  return handleResponse<unknown>(response);
}

export async function createIncident(token: string, data: { title: string; severity: string; description?: string }) {
  const response = await fetch(`${API_URL}/api/incidents`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse<unknown>(response);
}

export async function updateIncident(token: string, id: string, data: { status?: string; severity?: string }) {
  const response = await fetch(`${API_URL}/api/incidents/${id}`, {
    method: 'PUT',
    headers: getHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse<unknown>(response);
}

// ============================================
// Notifications
// ============================================

export async function listNotifications(token: string, unreadOnly = false) {
  const response = await fetch(`${API_URL}/api/notifications?unreadOnly=${unreadOnly}`, {
    headers: getHeaders(token),
  });
  return handleResponse<{ data: unknown[]; unread: number }>(response);
}

export async function markNotificationsRead(token: string, notificationIds?: string[]) {
  const response = await fetch(`${API_URL}/api/notifications/mark-read`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(notificationIds ? { notificationIds } : { all: true }),
  });
  return handleResponse<{ success: boolean }>(response);
}

// ============================================
// Analytics
// ============================================

export async function getAnalyticsOverview(token: string, period = '30d') {
  const response = await fetch(`${API_URL}/api/analytics/overview?period=${period}`, {
    headers: getHeaders(token),
  });
  return handleResponse<{ summary: unknown; trend: unknown[]; topAgents: unknown[] }>(response);
}

export async function getAnalyticsPerformance(token: string, period = '24h') {
  const response = await fetch(`${API_URL}/api/analytics/performance?period=${period}`, {
    headers: getHeaders(token),
  });
  return handleResponse<{ latency: unknown; throughput: unknown }>(response);
}

// ============================================
// Health
// ============================================

export async function healthCheck() {
  const response = await fetch(`${API_URL}/api/health`);
  return handleResponse<{ status: string; timestamp: string }>(response);
}

export async function healthLive() {
  const response = await fetch(`${API_URL}/api/health/live`);
  return handleResponse<{ status: string }>(response);
}

export async function healthReady() {
  const response = await fetch(`${API_URL}/api/health/ready`);
  return handleResponse<{ status: string; database: string }>(response);
}
