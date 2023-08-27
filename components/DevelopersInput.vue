<template>
    <b-taginput
        ref="input"
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
        :size="size || 'is-medium'"
        >
    </b-taginput>
</template>

<script>

export default {
    props: [
        "value",
        "size",
    ],
    emits: [
        "input",
    ],
    data() {
        return {
            developerList: [],
            developerListFiltered: [],
        }
    },

    async fetch() {
        const repo = [
            "angle",
            "chrome",
            "dawn",
            "skia",
            "v8",
            "webrtc",
        ];
        const fetch_as_json = x => fetch(`/data/${x}/users.json`).then(r => r.json());
        const jsons  = await Promise.all(repo.map(fetch_as_json));
        const merged = jsons.reduce((acc, json) => acc.concat(json), []);
        const list = [...new Set(merged)]

        this.developerList = list;
        const value = this.value.filter(v => list.includes(v));
        this.updateDevelopers(value);
    },

    methods: {
        computeDevelopersListFiltered(developer) {
            developer = developer.trim().toLowerCase();
            this.developerListFiltered = this.developerList.filter((option) => {
                return option.toLowerCase().indexOf(developer) == 0;
                return option.toLowerCase().includes(developer);
            })
            this.developerListFiltered.sort((a,b) => {
                return a.toLowerCase().indexOf(developer) -
                    b.toLowerCase().indexOf(developer);
            });
        },

        removeDeveloper(developer) {
            this.developers.splice(this.developers.indexOf(developer), 1);
            this.$emit("input", this.developers);
        },

        updateDevelopers(developers) {
            this.developers = developers;
            this.$emit("input", this.developers);
            this.colorizeDevelopers();
        },

        colorizeDevelopers() {
            setTimeout(() => {
                let i = 0;
                for(const element of this.$refs.input.$el.querySelectorAll(".tag")) {
                  element.style.backgroundColor = this.$color(this.developers[i]);
                  ++i;
                }
            }, 0);
        },
    },
};

</script>
