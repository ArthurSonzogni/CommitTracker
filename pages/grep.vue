<template>
  <div>
    <Navbar/>

    <section class="section">
      <GrepInput v-model="field_color" placeholder="color"/>
      <GrepInput v-model="field_size" placeholder="size"/>
      <GrepTreemap :field_color="field_color" :field_size="field_size"/>
    </section>

  </div>
</template>

<script>

export default {
  data() {
    return {
      field_color: ["DanglingUntriaged"],
      field_size: ["raw_ptr"]
    }
  }
}

</script>
