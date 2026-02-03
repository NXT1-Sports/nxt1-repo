import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiResponse } from '@nxt1/core/profile';
import { User } from '@nxt1/core';

@Injectable({
  providedIn: 'root',
})
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiURL;
  private readonly ssrUrl = environment.profileSsrUrl;

  /**
   * Get user profile by unicode (public access)
   * This is used for SEO and public profile viewing
   */
  getProfile(unicode: string): Observable<ApiResponse<User>> {
    // Try to get by username if unicode looks like a username, or id if it looks like an id.
    // Assuming unicode is the unique ID for now as per codebase convention.
    // If it fails, we might need a specific "get by unicode" endpoint if it differs from ID.
    // But usually in this project unicode == public ID.
    return this.http.get<ApiResponse<User>>(`${this.apiUrl}/profile/${unicode}`);
  }

  /**
   * Get public SEO data for a profile
   * Some backends have specific lightweight SEO endpoints
   */
  getProfileSeoData(unicode: string): Observable<any> {
    return this.http.get(`${this.ssrUrl}/${unicode}`);
  }
}
