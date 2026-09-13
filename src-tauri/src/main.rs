// Empêche l'ouverture d'une console Windows en plus de la fenêtre de l'app en release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    budget_perso_app_lib::run()
}
