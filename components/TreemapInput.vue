<template>
    <b-taginput
        ref="input"
        v-model="value"
        @input="updateInput"
        @typing="computeFilteredList"
        :data="entryListFiltered"
        :allow-new=false
        autocomplete
        icon="label"
        field="name"
        :placeholder="placeholder"
        type="is-primary"
        open-on-focus
        >
        <template v-slot="props">
            <strong class="mr-2 is-size-6"
                >{{ props.option.name }}</strong>
            <b-tag
                v-if="props.option.tags"
                v-for="tag in props.option.tags"
                :key="tag"
                :style="{
                    color: 'white',
                    backgroundColor: $color(tag)
                }"
                >
                {{ tag }}
            </b-tag>
            <p style="font-style: italic">
                {{ props.option.description }}
            </p>
        </template>
        <template v-slot:header>
            <div class="content">
               <strong class="is-size-4" >Metrics</strong>
            </div>
        </template>
    </b-taginput>
</template>

<script setup lang="ts">

// Format is:
// {
//   "metrics": [
//     {
//       "name": string,
//       "description": string,
//       "script": string,
//       "file":string
//       "tags": string[]
//     }
//   ]
// ]
import entries from '../public/treemap/entries.json'
import repositories_json from '../public/data/repositories.json'

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

const availableMetrics = ref(new Set<string>());

const fetchAvailableMetrics = async () => {
    if (!props.repositories || props.repositories.length === 0) {
        availableMetrics.value = new Set();
        return;
    }

    let intersection = null;

    for (const repo of props.repositories) {
        try {
            const response = await fetch(`/treemap/${repo}/available_metrics.json`);
            if (response.ok) {
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    const metrics = await response.json();
                    const metricsSet = new Set(metrics);
                    
                    if (intersection === null) {
                        intersection = metricsSet;
                    } else {
                        // Intersect
                        const newIntersection = new Set<string>();
                        for (const elem of intersection) {
                            if (metricsSet.has(elem)) {
                                newIntersection.add(elem);
                            }
                        }
                        intersection = newIntersection;
                    }
                } else {
                    intersection = new Set<string>();
                }
            } else {
                // If a repo is missing its JSON, we can assume it has 0 common metrics, or we ignore it.
                // Safest to intersect with empty set if it fails to load.
                intersection = new Set<string>();
            }
        } catch (e) {
            console.error(`Failed to fetch available metrics for ${repo}`, e);
            intersection = new Set<string>();
        }
    }
    
    availableMetrics.value = intersection || new Set();
    computeFilteredList(""); // Trigger refilter

    // Remove any currently selected values that are not available in the new repository
    if (value.value && Array.isArray(value.value)) {
        const newValue = value.value.filter((item: any) => availableMetrics.value.has(item.file));
        if (newValue.length !== value.value.length) {
            value.value = newValue;
        }
    }
};

watch(() => props.repositories, fetchAvailableMetrics, { immediate: true });

const entryListFiltered = ref([]);

const computeFilteredList = (name:string) => {
    entryListFiltered.value = entries.metrics.filter((option:any) => {
        // Must be in the available set
        if (!availableMetrics.value.has(option.file)) {
            return false;
        }

        if (!name || name.length === 0) {
            return true;
        }
        return option.name.toLowerCase().includes(name.toLowerCase()) ||
            option.description.toLowerCase().includes(name.toLowerCase()) ||
            option.file.toLowerCase().includes(name.toLowerCase());
        ;
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
