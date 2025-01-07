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
        open-on-focus
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

const developerList = shallowRef([]);
const developerListFiltered = shallowRef([]);

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

    const filter = option => option.toLowerCase().indexOf(developer) == 0;
    const sorter = (a, b) => a.toLowerCase().indexOf(developer) - b.toLowerCase().indexOf(developer);

    developerListFiltered.value =
        developerList.value
            .filter(filter)
            .sort(sorter);
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

    // When the user click on "enter", the first suggestion is selected.
    if (input.value.$el.querySelector("input") == null) {
        return;
    }
    input.value.$el.querySelector("input").addEventListener("keydown", (e) => {
        if (e.key == "Enter") {
            const first = input.value.$el.querySelector(".dropdown-item");
            if (first) {
                first.click();
            }
        }
    });

};
watch(developers, colorizeDevelopers);

</script>
