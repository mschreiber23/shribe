import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Attach auth token to every request from this instance
api.interceptors.request.use(config => {
  const token = localStorage.getItem('gymtrack_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Plans
export const getPlans = () => api.get('/plans').then(r => r.data);
export const getPlan = (id) => api.get(`/plans/${id}`).then(r => r.data);
export const createPlan = (data) => api.post('/plans', data).then(r => r.data);
export const updatePlan = (id, data) => api.put(`/plans/${id}`, data).then(r => r.data);
export const deletePlan = (id) => api.delete(`/plans/${id}`).then(r => r.data);
export const reorderPlans = (ids) => api.put('/plans/reorder', { ids }).then(r => r.data);
export const toggleGlobalPlan = (id) => api.put(`/plans/${id}/global`).then(r => r.data);

export const addExercise = (planId, data) => api.post(`/plans/${planId}/exercises`, data).then(r => r.data);
export const updateExercise = (planId, exId, data) => api.put(`/plans/${planId}/exercises/${exId}`, data).then(r => r.data);
export const deleteExercise = (planId, exId) => api.delete(`/plans/${planId}/exercises/${exId}`).then(r => r.data);

export const importCSV = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/plans/import/csv', form).then(r => r.data);
};

// Profile
export const getProfile = () => api.get('/profile').then(r => r.data);
export const updateProfile = (data) => api.put('/profile', data).then(r => r.data);
export const getFeed = (params) => api.get('/profile/feed', { params }).then(r => r.data);
// Social
export const searchUsers = (q) => api.get('/social/search', { params: { q } }).then(r => r.data);
export const getUserProfile = (userId) => api.get(`/social/users/${userId}`).then(r => r.data);
export const getFollowers = () => api.get('/social/followers').then(r => r.data);
export const getFollowing = () => api.get('/social/following').then(r => r.data);
export const followUser = (userId) => api.post(`/social/follow/${userId}`).then(r => r.data);
export const unfollowUser = (userId) => api.delete(`/social/follow/${userId}`).then(r => r.data);
export const sharePlan = (planId, data) => api.post(`/social/share/${planId}`, data).then(r => r.data);
export const getInbox = () => api.get('/social/inbox').then(r => r.data);
export const getInboxUnread = () => api.get('/social/inbox/unread').then(r => r.data);
export const acceptShare = (shareId) => api.post(`/social/inbox/${shareId}/accept`).then(r => r.data);
export const dismissShare = (shareId) => api.delete(`/social/inbox/${shareId}`).then(r => r.data);

// Activities (non-workout)
export const getActivityTypes = () => api.get('/activities/types').then(r => r.data);
export const createActivityType = (data) => api.post('/activities/types', data).then(r => r.data);
export const deleteActivityType = (id) => api.delete(`/activities/types/${id}`).then(r => r.data);
export const getActivityLogs = (params) => api.get('/activities', { params }).then(r => r.data);
export const logActivity = (data) => api.post('/activities', data).then(r => r.data);
export const deleteActivityLog = (id) => api.delete(`/activities/${id}`).then(r => r.data);

// Recovery days
export const getRecoveryDay = (date) => api.get(`/recovery/${date}`).then(r => r.data);
export const logRecoveryDay = (date, notes) => api.post('/recovery', { date, notes }).then(r => r.data);
export const removeRecoveryDay = (date) => api.delete(`/recovery/${date}`).then(r => r.data);

// Whoop
export const getWhoopStatus = () => api.get('/whoop/status').then(r => r.data);
export const getWhoopDebug = () => api.get('/whoop/debug').then(r => r.data);
export const getWhoopDaily = () => api.get('/whoop/daily').then(r => r.data);
export const getWhoopHistory = (limit) => api.get('/whoop/history', { params: { limit } }).then(r => r.data);
export const disconnectWhoop = () => api.delete('/whoop/disconnect').then(r => r.data);

export const uploadAvatar = (file) => {
  const form = new FormData();
  form.append('avatar', file);
  return api.post('/profile/avatar', form).then(r => r.data);
};
export const deleteAvatar = () => api.delete('/profile/avatar').then(r => r.data);

export const importImage = (file) => {
  const form = new FormData();
  form.append('image', file);
  return api.post('/plans/import/image', form).then(r => r.data);
};

export const saveImageImport = (plans) =>
  api.post('/plans/import/image/save', { plans }).then(r => r.data);

// Schedule
export const getSchedule = (start, end) => api.get('/schedule', { params: { start, end } }).then(r => r.data);
export const getScheduleByDate = (date) => api.get(`/schedule/date/${date}`).then(r => r.data); // returns array
export const setScheduleEntry = (data) => api.post('/schedule', data).then(r => r.data);
export const deleteScheduleEntry = (id) => api.delete(`/schedule/${id}`).then(r => r.data);
export const deleteScheduleByDate = (date) => api.delete(`/schedule/date/${date}`).then(r => r.data);
export { deleteScheduleEntry as removeScheduleEntry };

// Sessions
export const getSessions = (params) => api.get('/sessions', { params }).then(r => r.data);
export const getPreviousSession = (planId, excludeSessionId) =>
  api.get('/sessions/previous', { params: { planId, excludeSessionId } }).then(r => r.data);
export const getSession = (id) => api.get(`/sessions/${id}`).then(r => r.data);
export const createSession = (data) => api.post('/sessions', data).then(r => r.data);
export const updateSession = (id, data) => api.put(`/sessions/${id}`, data).then(r => r.data);
export const deleteSession = (id) => api.delete(`/sessions/${id}`).then(r => r.data);

export const logSet = (sessionId, data) => api.post(`/sessions/${sessionId}/sets`, data).then(r => r.data);
export const updateSet = (sessionId, setId, data) => api.put(`/sessions/${sessionId}/sets/${setId}`, data).then(r => r.data);
export const deleteSet = (sessionId, setId) => api.delete(`/sessions/${sessionId}/sets/${setId}`).then(r => r.data);
