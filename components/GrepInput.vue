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

<script>

export default {
    props: [
        "value",
        "placeholder"
    ],
    emits: [
        "input"
    ],
    data() {
        return {
            entryList: [],
            entryListFiltered: [],
        }
    },

    async fetch() {
        const response = await fetch("./data/grep/entries.json");
        const list = await response.json();
        this.entryList = list.map(e => e.name)
        this.entryListFiltered = this.entryList;
    },

    methods: {
        computeFilteredList(name) {
            this.entryListFiltered = this.entryList.filter((option) => {
                return option.indexOf(name) == 0;
            })
        },

        removeDeveloper(name) {
            this.name.splice(this.name.indexOf(name), 1);
            this.$emit("input", this.name);
        },

        updateInput(name) {
            this.name = name;
            this.$emit("input", this.name);
            setTimeout(() => {
                let i = 0;
                for(const element of this.$refs.input.$el.querySelectorAll(".tag")) {
                    element.style.backgroundColor = this.$color(name[i]);
                    ++i;
                }
            }, 0);
        },
    },
};

</script>
