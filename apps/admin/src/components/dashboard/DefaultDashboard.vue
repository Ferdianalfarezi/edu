<script setup lang="ts">
import { QuickActionCard } from '@/components/ui';
</script>

<template>
  <div>
    <div class="bg-white border-2 border-stone-200 rounded-2xl p-6 mb-8">
      <p class="text-[15px] text-text-secondary">
        Gunakan menu navigasi di sebelah kiri untuk mengakses fitur yang tersedia sesuai dengan
        peran Anda.
      </p>
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <QuickActionCard
        title="Input Absensi"
        description="Catat kehadiran siswa hari ini"
        icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        icon-color="bg-primary-600"
        to="/absensi/input"
      />
      <QuickActionCard
        title="Portal RPP"
        description="Lihat dan buat rencana pembelajaran"
        icon="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        icon-color="bg-success-600"
        to="/rpp/portal"
      />
      <QuickActionCard
        title="Jadwal"
        description="Lihat jadwal mengajar"
        icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        icon-color="bg-accent-600"
        to="/jadwal-saya"
      />
    </div>
  </div>
</template>
