<template>
    <b-taginput
        ref="input"
        v-model="developers"
        @typing="computeDevelopersListFiltered"
        :data="developerListFiltered"
        :allow-new=false
        autocomplete
        icon="label"
        field="this"
        placeholder="developer username"
        type="is-primary"
        :size="size || 'is-medium'"
        >
    </b-taginput>
</template>

<script setup lang="ts">

import repositories from 'public/data/repositories.json'

const input = ref(null);

const developers = defineModel();

const props = defineProps({
    size: {
        type: String,
        required: false,
    },
});

const developerList = ref([]);
const developerListFiltered = ref([]);

const fetchData = async () => {
    const fetch_as_json = x => fetch(`/data/${x.dirname}/usernames.json`).then(r => r.json());
    const jsons  = await Promise.all(repositories.map(fetch_as_json));
    const merged = jsons.reduce((acc, json) => acc.concat(json), []);
    const list = [...new Set(merged)]

    developerList.value = list;
    developers.value = developers.value.filter(v => list.includes(v));
};
fetchData();

const computeDevelopersListFiltered = (developer) => {
    developer = developer.trim().toLowerCase();
    developerListFiltered.value = developerList.value.filter((option) => {
        return option.toLowerCase().indexOf(developer) == 0;
    })
    developerListFiltered.value.sort((a,b) => {
        return a.toLowerCase().indexOf(developer) -
            b.toLowerCase().indexOf(developer);
    });
};

const { $color } = useNuxtApp();

const colorizeDevelopers = () => {
    setTimeout(() => {
        let i = 0;
        for(const element of input.value.$el.querySelectorAll(".tag")) {
            element.style.backgroundColor = $color(developers.value[i]);
            ++i;
        }
    }, 0);
};
watch(developers, colorizeDevelopers);

</script>
