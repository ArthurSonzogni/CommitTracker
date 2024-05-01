<template>
    <b-field expanded>
        <b-taginput
            ref="input"
            :value="value"
            @input="updateInput"
            @typing="computeFilteredList"
            :data="entryListFiltered"
            :allow-new=false
            open-on-focus
            autocomplete
            icon="label"
            field="this"
            :placeholder="placeholder"
            type="is-primary"
            size="is-medium"
            >
        </b-taginput>
    </b-field>
</template>

<script setup lang="ts">

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

const entryList = ref([]);
const entryListFiltered = ref([]);

const fetchEntries = async () => {
    const response = await fetch("/data/chromium/treemap/entries.json");
    const list = await response.json();
    entryList.value = list.map(e => e.file);
    entryListFiltered.value = entryList.value;
};
fetchEntries();

const computeFilteredList = (name:string) => {
    entryListFiltered.value = entryList.value.filter((option:any) => {
        return option.indexOf(name) == 0;
    });
};

const updateInput = (name:string) => {
    emit("input", name);
    refreshColors(name);
};

const { $color } = useNuxtApp();

const refreshColors = (name:string) => {
    setTimeout(() => {
        let i = 0;
        for(const element of input.value.$el.querySelectorAll(".tag")) {
            element.style.backgroundColor = $color(name[i]);
            ++i;
        }
    }, 0);
};

onMounted(() => {
    refreshColors(value);
});

</script>
