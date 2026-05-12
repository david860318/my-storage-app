import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { 
    path: '/', 
    name: 'Inventory', 
    component: () => import('../views/Inventory.vue') 
  },
  { 
    path: '/tags', 
    name: 'Tags', 
    component: () => import('../views/TagManager.vue') 
  },
  { 
    path: '/profile', 
    name: 'Profile', 
    component: () => import('../views/Profile.vue') 
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  linkActiveClass: 'active'
})

export default router