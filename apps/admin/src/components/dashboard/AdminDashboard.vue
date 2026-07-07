<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/client';

interface TenantStats {
  total_users: number;
  total_students: number;
  total_classes: number;
  total_teachers: number;
  active_tahun_ajaran: string | null;
}

const loading = ref(true);
const error = ref<string | null>(null);
const stats = ref<TenantStats | null>(null);

async function fetchStats() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get<TenantStats>('/tenants/stats');
    stats.value = data;
  } catch (err: unknown) {
    error.value = 'Gagal memuat statistik tenant.';
    console.error('Failed to fetch tenant stats:', err);
  } finally {
    loading.value = false;
  }
}

onMounted(fetchStats);
</script>

<template>
  <div class="admin-dashboard">
    <h2>Dashboard Admin</h2>

    <div v-if="loading" class="loading">Memuat data...</div>

    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
      <button @click="fetchStats">Coba Lagi</button>
    </div>

    <template v-else-if="stats">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">👥</div>
          <div class="stat-content">
            <span class="stat-value">{{ stats.total_users }}</span>
            <span class="stat-label">Total Pengguna</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">🎓</div>
          <div class="stat-content">
            <span class="stat-value">{{ stats.total_students }}</span>
            <span class="stat-label">Total Siswa</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">🏫</div>
          <div class="stat-content">
            <span class="stat-value">{{ stats.total_classes }}</span>
            <span class="stat-label">Total Kelas</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">👨‍🏫</div>
          <div class="stat-content">
            <span class="stat-value">{{ stats.total_teachers }}</span>
            <span class="stat-label">Total Guru</span>
          </div>
        </div>
      </div>

      <div v-if="stats.active_tahun_ajaran" class="active-tahun-ajaran">
        <p>
          Tahun Ajaran Aktif: <strong>{{ stats.active_tahun_ajaran }}</strong>
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.admin-dashboard {
  max-width: 800px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1.25rem;
  margin-bottom: 2rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.stat-icon {
  font-size: 2rem;
}

.stat-content {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1e293b;
}

.stat-label {
  font-size: 0.8125rem;
  color: #64748b;
}

.active-tahun-ajaran {
  padding: 1rem 1.25rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
}

.active-tahun-ajaran p {
  margin: 0;
  color: #166534;
}

.loading {
  padding: 2rem;
  text-align: center;
  color: #64748b;
}

.error {
  padding: 1.5rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  text-align: center;
}

.error button {
  margin-top: 0.75rem;
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
</style>
