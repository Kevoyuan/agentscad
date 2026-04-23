// Part family: spur_gear
// Generated on: 2024-01-01

// Gear parameters
teeth = 17;
outer_diameter = 20;
root_diameter = 15;
bore_diameter = 5;
thickness = 5;
pressure_angle = 20; // Standard pressure angle

// Calculated parameters
pitch_diameter = (outer_diameter + root_diameter) / 2;
module = pitch_diameter / teeth;
tooth_thickness = (PI * module) / 2;
tooth_height = (outer_diameter - root_diameter) / 2;

// Create the gear
module spur_gear() {
    difference() {
        linear_extrude(height = thickness)
            union() {
                // Base circle (root)
                circle(d = root_diameter);
                // Add teeth
                for (i = [0:teeth-1]) {
                    rotate([0, 0, i * (360/teeth)])
                        translate([pitch_diameter/2, 0, 0])
                            square([tooth_thickness, tooth_height], center=true);
                }
            }
        // Bore hole
        cylinder(d = bore_diameter, h = thickness*3, center=true);
    }
}

// Render the gear
spur_gear();