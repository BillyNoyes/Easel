<script setup lang="ts">
import {ref} from 'vue';

defineProps({
  decrease: {type: String, required: true},
  increase: {type: String, required: true},
});

const count = ref(0);
</script>

<template>
  <div class="counter">
    <button type="button" :aria-label="decrease" @click="count -= 1">−</button>
    <output>{{ count }}</output>
    <button type="button" :aria-label="increase" @click="count += 1">+</button>
  </div>
</template>
