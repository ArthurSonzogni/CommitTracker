<template>
    <b-navbar type="is-primary">
        <template #brand>
            <b-navbar-item tag="router-link" :to="{ path: '/' }">
                <b-icon icon="home" >
                </b-icon>
            </b-navbar-item>
        </template>

        <template #start>
            <b-navbar-item tag="router-link" :to="{ path: '/timeline' }">
                Timeline
            </b-navbar-item>
            <b-navbar-item tag="router-link" :to="{ path: '/social-map' }">
                Social Map
            </b-navbar-item>
            <b-navbar-item tag="router-link" :to="{ path: '/api' }">
                API
            </b-navbar-item>
        </template>

        <template #end>
            <b-navbar-item
                href="https://github.com/ArthurSonzogni/ChromeCommitTracker/">
                source
            </b-navbar-item>
        </template>
    </b-navbar>
</template>
