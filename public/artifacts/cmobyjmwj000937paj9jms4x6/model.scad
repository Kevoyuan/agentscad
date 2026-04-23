// Spur gear generator
// Generated on 2024-06-01

// Parameters
$fn = 100; // Resolution

// Gear parameters
teeth = 17;
outer_diameter = 20;
bore_diameter = 5;
thickness = 5;
pressure_angle = 20; // Not used in simplified model
inner_diameter = 15;

// Calculated dimensions
root_diameter = inner_diameter;
tooth_height = (outer_diameter - root_diameter) / 2;
root_radius = root_diameter / 2;
outer_radius = outer_diameter / 2;

// Simplified tooth profile widths
base_width = (3.14159 * root_diameter) / (2 * teeth);
top_width = (3.14159 * outer_diameter) / (2 * teeth);

// Main gear body
difference() {
    // Union of root cylinder and teeth
    union() {
        // Root cylinder
        cylinder(h = thickness, r = root_radius, center = false);
        // Teeth
        for (i = [0:teeth-1]) {
            rotate([0, 0, i * (360 / teeth)]) {
                translate([root_radius, 0, 0]) {
                    // Create one tooth
                    linear_extrude(height = thickness) {
                        polygon(points = [
                            [0, 0],
                            [base_width/2, 0],
                            [top_width/2, tooth_height],
                            [-top_width/2, tooth_height],
                            [-base_width/2, 0]
                        ]);
                    }
                }
            }
        }
    }
    // Bore hole
    translate([0, 0, -0.1]) {
        cylinder(h = thickness + 0.2, d = bore_diameter, center = false);
    }
}