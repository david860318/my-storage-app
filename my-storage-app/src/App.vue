<script setup>
import { ref, onMounted } from 'vue';
import { Analytics } from '@vercel/analytics/vue';
import { supabase } from './supabase';
import Auth from './components/Auth.vue';
import Sidebar from './components/Sidebar.vue';

const session = ref(null);
const isInitializing = ref(true);
const userProfile = ref({ username: '', avatar_url: '' });

onMounted(async () => {
  try {
    const { data } = await supabase.auth.getSession();
    session.value = data.session;
    if (session.value) await fetchProfile();
  } catch (e) {
    console.error("Init Error:", e);
  } finally {
    isInitializing.value = false;
  }

  supabase.auth.onAuthStateChange((_event, _session) => {
    session.value = _session;
    if (_session) fetchProfile();
  });
});

const fetchProfile = async () => {
  const { data } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', session.value.user.id)
    .single();
  if (data) userProfile.value = data;
};

const handleLogout = async () => {
  await supabase.auth.signOut();
  window.location.reload();
};
</script>

<template>
  <Analytics />
  
  <div v-if="isInitializing" class="loading-screen">
    <p>SYSTEM LOADING...</p>
  </div>

  <Auth v-else-if="!session" />

  <div v-else class="app-container">
    <Sidebar :profile="userProfile" @logout="handleLogout" />
    
    <main class="main-viewport">
      <router-view />
    </main>
  </div>
</template>

<style>
/* 強制定義變數 */
:root {
  --sidebar-w: 260px;
  --accent: #c084fc;
}

* { 
  box-sizing: border-box; 
  margin: 0; 
  padding: 0; 
}

/* 確保 body 本身沒有奇怪的溢出 */
body { 
  background: #0a0a0c; 
  color: #fff; 
  font-family: system-ui, -apple-system, sans-serif;
  min-height: 100vh;
}

/* 這裡是最關鍵的佈局 */
.app-container {
  display: flex;
  width: 100vw;
  min-height: 100vh;
  position: relative;
}

/* 側邊欄固定在左邊 */
.side-nav {
  width: var(--sidebar-w);
  height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  z-index: 1000;
  background: #111116;
  border-right: 1px solid #333;
}

/* 主內容區域 */
.main-viewport {
  flex: 1;
  margin-left: var(--sidebar-w); /* 絕對要推開 260px */
  padding: 40px;
  min-height: 100vh;
  background: #0a0a0c;
  
  
  /* 確保內容向上對齊且可見 */
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
}

/* 轉場動畫如果出錯會導致組件隱形，我們先強制顯示 */
.page-fade-enter-active, .page-fade-leave-active {
  transition: none !important;
}

@media (max-width: 768px) {
  .main-viewport { margin-left: 0; }
}
</style>
