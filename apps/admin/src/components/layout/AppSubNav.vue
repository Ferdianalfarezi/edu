<script setup lang="ts">
interface SubNavTab {
  label: string;
  path: string;
}

interface Props {
  tabs: SubNavTab[];
  activePath: string;
}

const props = defineProps<Props>();

function isActive(tab: SubNavTab): boolean {
  if (tab.path === '/') {
    return props.activePath === '/';
  }
  return props.activePath === tab.path || props.activePath.startsWith(tab.path + '/');
}
</script>

<template>
  <nav v-if="tabs.length" class="sub-nav">
    <div class="sub-nav__tabs">
      <router-link
        v-for="tab in tabs"
        :key="tab.path"
        :to="tab.path"
        class="sub-nav__tab"
        :class="{ 'sub-nav__tab--active': isActive(tab) }"
      >
        {{ tab.label }}
      </router-link>
    </div>
  </nav>
</template>

<style scoped>
.sub-nav {
  height: 62px;
  background-color: var(--color-primary-50);
  border-bottom: 3px solid var(--color-primary-200);
  display: flex;
  align-items: center;
  padding: 0 24px;
}

.sub-nav__tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.sub-nav__tabs::-webkit-scrollbar {
  display: none;
}

.sub-nav__tab {
  font-size: 15px;
  font-weight: 700;
  padding: 12px 22px;
  border-radius: 10px;
  white-space: nowrap;
  text-decoration: none;
  transition: all 200ms ease;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.6);
  color: var(--color-primary-800);
}

.sub-nav__tab--active {
  background: var(--color-primary-600);
  color: #ffffff;
}

.sub-nav__tab:not(.sub-nav__tab--active):hover {
  background: #ffffff;
  border-color: var(--color-primary-300);
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.08);
}
</style>
