<script setup>
defineProps(['profile']);
defineEmits(['logout']);
</script>

<template>
  <aside class="side-nav">
    <div class="logo">收納小幫手</div>
    
    <nav class="links">
      <router-link to="/" class="item">
        <span class="icon">📦</span> 庫存清單
      </router-link>

      <router-link to="/tags" class="item">
        <span class="icon">🏷️</span> 標籤管理
      </router-link>

      <router-link to="/profile" class="item">
        <span class="icon">👤</span> 個人帳戶
      </router-link>
    </nav>

    <button @click="$emit('logout')" class="out-btn">登出</button>
  </aside>
</template>

<style scoped>
/* 確保點擊後有紫色高亮 */
.item.active {
  background: rgba(192, 132, 252, 0.15) !important;
  color: #c084fc !important;
  border-left: 3px solid #c084fc;
}
</style>

<style scoped>
.side-nav {
  width: 260px;
  height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  background: #111116;
  border-right: 1px solid #222;
  display: flex;
  flex-direction: column;
  padding: 20px;
  z-index: 100;
}

.logo {
  font-size: 1.2rem;
  font-weight: bold;
  margin-bottom: 40px;
  color: var(--accent);
}

.links {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item {
  color: #888;
  text-decoration: none;
  padding: 12px;
  border-radius: 8px;
}

.item.active {
  background: rgba(192, 132, 252, 0.1);
  color: var(--accent);
}

.out-btn {
  background: none;
  border: 1px solid #ff5f5f;
  color: #ff5f5f;
  padding: 10px;
  cursor: pointer;
  border-radius: 8px;
}
</style>