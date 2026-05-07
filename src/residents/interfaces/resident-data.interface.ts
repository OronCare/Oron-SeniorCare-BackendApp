export interface EmergencyContact {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  phone: string;
  relation: string;
  email?: string | null;
}

export interface ResidentData {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  dob: string;
  gender: string;
  room: string;
  status: string;
  healthState: string;
  admissionDate: string;
  weight: number;
  height: string;
  emergencyContacts: EmergencyContact[];
  medicalHistory: string;
  allergies: string;
  primaryDiagnosis: string;
  lastVitalsDate: string;
  photoUrl?: string;
}
