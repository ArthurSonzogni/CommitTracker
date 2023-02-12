<template>
    <b-field expanded>
        <b-taginput
            :value="value"
            @input="updateDevelopers"
            @typing="computeDevelopersListFiltered"
            :data="developerListFiltered"
            :allow-new=false
            autocomplete
            icon="label"
            field="this"
            placeholder="developer username"
            type="is-primary"
            size="is-medium"
            >
        </b-taginput>
    </b-field>
</template>

<script>

export default {
    props: [
        "value"
    ],
    emits: [
        "input"
    ],
    data() {
        return {
            developerList: [],
            developerListFiltered: [],
        }
    },

    async fetch() {
        const response = await fetch("./data/users.json");
        const list = await response.json();
        this.developerList = list;
    },

    methods: {
        computeDevelopersListFiltered(developer) {
            this.developerListFiltered = this.developerList.filter((option) => {
                return option.indexOf(developer) >= 0;
            })
        },

        removeDeveloper(developer) {
            this.developers.splice(this.developers.indexOf(developer), 1);
            this.$emit("input", this.developers);
        },

        updateDevelopers(developers) {
            this.developers = developers;
            this.$emit("input", this.developers);
        },
    },
};

</script>
