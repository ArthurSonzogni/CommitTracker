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
        <template v-slot="props">
            <!-- Split the tag in 2-3 parts. The part that matches the input is
                highlighted. The rest isn't. The email domain is yellow. -->
            <span v-for="(part, index) in props.option.split('@')" :key="index">
                <span v-if="index == 0">
                    {{part}}
                </span>
                <strong v-else style="color: blue">
                    (@{{ part }})
                </strong>
            </span>
        </template>
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

    allowUsername: {
        type: Boolean,
        default: true,
    },

    allowEmail: {
        type: Boolean,
        default: false,
    },
});

const developerList = shallowRef([]);
const developerListFiltered = shallowRef([]);

const FetchData = (filename) => async () => {
    const fetch_json = x => fetch(x).then(j => j.json());
    const fetch_this = x => fetch_json(`/data/${x.dirname}/${filename}`);
    const jsons  = await Promise.all(repositories.map(fetch_this));
    const merged = jsons.reduce((acc, json) => acc.concat(json), []);
    return new Set(merged);
}

const FetchUsernames = FetchData("usernames.json");
const FetchEmails = FetchData("emails.json");

new Promise(async () => {
    let set = new Set();
    if (props.allowUsername) {
        const usernames = await FetchUsernames();
        set = set.union(usernames);
    }
    if (props.allowEmail) {
        const emails = await FetchEmails();
        set = set.union(emails);
    }
    const array = Array.from(set);

    developerList.value = array
    // Remove developers that are not in the list.
    developers.value.filter(v => array.includes(v));
});

const computeDevelopersListFiltered = (developer) => {
    if (developer == null || developer.length <= 2) {
        developerListFiltered.value = [];
        return;
    }

    developer = developer.trim().toLowerCase();

    const filter = option => option.toLowerCase().indexOf(developer) == 0;
    const sorter = (a, b) => a.toLowerCase().indexOf(developer) - b.toLowerCase().indexOf(developer);

    developerListFiltered.value =
        developerList.value
            .filter(filter)
            .slice(0, 1000)
            .sort(sorter)
            .slice(0, 10);
};

const { $color } = useNuxtApp();

const colorizeDevelopers = async () => {
    await new Promise(r => setTimeout(r, 100));
    let i = 0;
    for(const element of input.value.$el.querySelectorAll(".tag")) {
        element.style.backgroundColor = $color(developers.value[i]);
        ++i;
    }
}

// When the user click on "enter", the first suggestion is selected.
const installInputHandler = async () => {
    while (input.value == null) {
        await new Promise(r => setTimeout(r, 100));
    }
    input.value.$el.querySelector("input").addEventListener("keydown", (e) => {
        console.log("keydown", e);
        if (e.key == "Enter") {
            const first = input.value.$el.querySelector(".dropdown-item");
            if (first) {
                first.click();
            }
        }
    });

};
watch(developers, colorizeDevelopers);
colorizeDevelopers();
installInputHandler();

</script>
