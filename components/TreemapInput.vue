<template>
    <UiTagInput ref="input" v-model="value" @input="updateInput" @typing="computeFilteredList" :suggestions="entryListFiltered" :allow-new="false" icon="label" field="name" :placeholder="placeholder" open-on-focus>
        <template v-slot="props">
            <strong class="mr-2 is-size-6"
                >{{ props.option.name }}</strong>
            <span class="tag" v-if="props.option.tags" v-for="tag in props.option.tags" :key="tag" :style="tagStyle(tag)">
                {{ tag }}
            </span>
            <p style="font-style: italic">
                {{ props.option.description }}
            </p>
        </template>
        <template v-slot:header>
            <div class="content">
               <strong class="is-size-4" >Metrics</strong>
            </div>
        </template>
    </UiTagInput>
</template>

<script setup lang="ts">

import repositories_json from '../public/data/repositories.json'
import {
    allTreemapMetrics,
    fetchRepoAvailableMetrics,
    getCachedAvailableMetrics,
} from '~/utils/treemapMetrics'

const { $color } = useNuxtApp();
const tagStyleCache = new Map<string, { color: string; backgroundColor: string }>();
const tagStyle = (tag: string) => {
    let cached = tagStyleCache.get(tag);
    if (!cached) {
        const bg = $color(tag);
        cached = { color: textColorOn(bg), backgroundColor: bg };
        tagStyleCache.set(tag, cached);
    }
    return cached;
};

const value = defineModel("value");

const input = ref(null);

const props = defineProps({
    placeholder: {
        type: String,
        required: false,
        default: "Type to filter"
    },
    repositories: {
        type: Array,
        required: false,
        default: () => [repositories_json[0]?.dirname || "chromium"]
    }
});

const emit = defineEmits(["input"]);

const availableMetrics = shallowRef(new Set<string>());

const applyAvailableSet = (set: Set<string>) => {
    availableMetrics.value = set;
    computeFilteredList("");

    if (value.value && Array.isArray(value.value)) {
        const newValue = value.value.filter((item: any) => set.has(item.file));
        if (newValue.length !== value.value.length) {
            value.value = newValue;
        }
    }
};

const fetchAvailableMetrics = async () => {
    const repos = (props.repositories as string[]) || [];
    if (repos.length === 0) {
        applyAvailableSet(new Set());
        return;
    }

    if (repos.length === 1) {
        const sync = getCachedAvailableMetrics(repos[0]);
        if (sync) {
            applyAvailableSet(sync);
            return;
        }
    }

    const sets = await Promise.all(repos.map(repo => fetchRepoAvailableMetrics(repo)));
    let intersection = sets[0] || new Set<string>();
    for (let i = 1; i < sets.length; i++) {
        const next = new Set<string>();
        for (const elem of intersection) {
            if (sets[i].has(elem)) next.add(elem);
        }
        intersection = next;
    }
    applyAvailableSet(intersection);
};

watch(() => props.repositories, fetchAvailableMetrics, { immediate: true });

const entryListFiltered = shallowRef<any[]>([]);

const computeFilteredList = (name: string) => {
    const query = name?.toLowerCase() || "";
    const avail = availableMetrics.value;
    entryListFiltered.value = allTreemapMetrics.filter((option) => {
        if (!avail.has(option.file)) return false;
        if (!query) return true;
        return option.searchText.includes(query);
    });
};

const updateInput = (name:string) => {
    emit("input", name);
};

</script>

<style>
.autocomplete .dropdown-content {
    max-height: 600px;
    overflow-y: auto;
}
</style>
