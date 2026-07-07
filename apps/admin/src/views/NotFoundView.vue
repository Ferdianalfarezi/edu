<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="not-found">
    <h1>404 — Halaman Tidak Ditemukan</h1>
    <p>Halaman yang Anda cari tidak tersedia.</p>
    <button @click="router.push('/')">Kembali ke Dashboard</button>
  </div>
</template>

<style scoped>
.not-found {
  max-width: 500px;
  margin: 100px auto;
  text-align: center;
}

button {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
</style>
