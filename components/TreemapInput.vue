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
        size="is-medium"
        open-on-focus
        append-to-body
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

const value = defineModel("value");

const input = ref(null);

const props = defineProps({
    placeholder: {
        type: String,
        required: false,
        default: "Type to filter"
    }
});

const emit = defineEmits(["input"]);

const entryListFiltered = ref(entries.metrics);
const computeFilteredList = (name:string) => {
    entryListFiltered.value = entries.metrics.filter((option:any) => {
        if (option.length === 0) {
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
