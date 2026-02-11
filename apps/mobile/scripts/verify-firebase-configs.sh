#!/bin/bash
# verify-firebase-configs.sh
# Verify Firebase configurations have correct Bundle ID / Package Name

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$MOBILE_DIR/firebase-configs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Expected Bundle/Package ID
EXPECTED_ID="com.nxt1sports.nxt1"

echo -e "${BLUE}🔍 Firebase Configuration Verification${NC}"
echo -e "${BLUE}====================================${NC}"
echo ""
echo -e "${GREEN}Expected Bundle/Package ID:${NC} $EXPECTED_ID"
echo ""

# Function to check iOS plist file
check_ios_config() {
    local env=$1
    local file_path="$CONFIG_DIR/$env/ios/GoogleService-Info.plist"
    
    echo -e "${BLUE}📱 Checking iOS ($env)${NC}"
    
    if [[ ! -f "$file_path" ]]; then
        echo -e "${RED}❌ File not found: $file_path${NC}"
        echo -e "${YELLOW}   Need to download from Firebase Console${NC}"
        return 1
    fi
    
    # Check if BUNDLE_ID exists and matches
    if grep -q "<key>BUNDLE_ID</key>" "$file_path"; then
        local bundle_id=$(grep -A1 "<key>BUNDLE_ID</key>" "$file_path" | grep "<string>" | sed 's/.*<string>\(.*\)<\/string>.*/\1/')
        
        if [[ "$bundle_id" == "$EXPECTED_ID" ]]; then
            echo -e "${GREEN}✅ Bundle ID: $bundle_id${NC}"
        else
            echo -e "${RED}❌ Bundle ID: $bundle_id (should be $EXPECTED_ID)${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ BUNDLE_ID key not found in plist${NC}"
        return 1
    fi
    
    # Check PROJECT_ID
    if grep -q "<key>PROJECT_ID</key>" "$file_path"; then
        local project_id=$(grep -A1 "<key>PROJECT_ID</key>" "$file_path" | grep "<string>" | sed 's/.*<string>\(.*\)<\/string>.*/\1/')
        echo -e "${GREEN}✅ Project ID: $project_id${NC}"
    fi
    
    # Check CLIENT_ID exists (Google Sign-In)
    if grep -q "<key>CLIENT_ID</key>" "$file_path"; then
        echo -e "${GREEN}✅ Google Client ID configured${NC}"
    else
        echo -e "${YELLOW}⚠️ Google Client ID missing${NC}"
    fi
    
    echo ""
    return 0
}

# Function to check Android JSON file
check_android_config() {
    local env=$1
    local file_path="$CONFIG_DIR/$env/android/google-services.json"
    
    echo -e "${BLUE}🤖 Checking Android ($env)${NC}"
    
    if [[ ! -f "$file_path" ]]; then
        echo -e "${RED}❌ File not found: $file_path${NC}"
        echo -e "${YELLOW}   Need to download from Firebase Console${NC}"
        return 1
    fi
    
    # Check if package_name matches expected ID
    if grep -q "\"package_name\"" "$file_path"; then
        local package_names=($(grep "\"package_name\"" "$file_path" | sed 's/.*"package_name": "\([^"]*\)".*/\1/'))
        local correct_count=0
        
        for package_name in "${package_names[@]}"; do
            if [[ "$package_name" == "$EXPECTED_ID" ]]; then
                echo -e "${GREEN}✅ Package Name: $package_name${NC}"
                ((correct_count++))
            else
                echo -e "${RED}❌ Package Name: $package_name (should be $EXPECTED_ID)${NC}"
            fi
        done
        
        if [[ $correct_count -eq 0 ]]; then
            return 1
        fi
    else
        echo -e "${RED}❌ package_name key not found in json${NC}"
        return 1
    fi
    
    # Check project_id
    if grep -q "\"project_id\"" "$file_path"; then
        local project_id=$(grep "\"project_id\"" "$file_path" | head -1 | sed 's/.*"project_id": "\([^"]*\)".*/\1/')
        echo -e "${GREEN}✅ Project ID: $project_id${NC}"
    fi
    
    # Check OAuth clients exist (Google Sign-In)
    if grep -q "\"oauth_client\"" "$file_path"; then
        local oauth_count=$(grep -c "\"client_id\"" "$file_path" | head -1)
        if [[ $oauth_count -gt 0 ]]; then
            echo -e "${GREEN}✅ OAuth clients configured ($oauth_count)${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️ OAuth clients missing${NC}"
    fi
    
    echo ""
    return 0
}

# Function to show download instructions
show_download_instructions() {
    local env=$1
    local project_id=""
    
    if [[ "$env" == "staging" ]]; then
        project_id="nxt-1-staging"
    elif [[ "$env" == "production" ]]; then
        project_id="nxt-1-de054"
    fi
    
    echo -e "${YELLOW}📥 How to Download Correct $env Configuration${NC}"
    echo -e "${YELLOW}=========================================${NC}"
    echo ""
    echo -e "${BLUE}🔗 Firebase Console:${NC} https://console.firebase.google.com/project/$project_id/settings/general"
    echo ""
    echo -e "${BLUE}📱 For iOS (GoogleService-Info.plist):${NC}"
    echo "1. Go to Firebase Console → Project Settings"
    echo "2. Scroll to 'Your apps' section"
    echo "3. Look for iOS app with Bundle ID: $EXPECTED_ID"
    echo "4. If app doesn't exist:"
    echo "   - Click 'Add app' → iOS"
    echo "   - Bundle ID: $EXPECTED_ID"
    echo "   - App nickname: NXT1 Sports ($env)"
    echo "5. Click 'GoogleService-Info.plist' download button"
    echo "6. Save to: $CONFIG_DIR/$env/ios/GoogleService-Info.plist"
    echo ""
    echo -e "${BLUE}🤖 For Android (google-services.json):${NC}"
    echo "1. Same Firebase Console → Project Settings"
    echo "2. Look for Android app with Package name: $EXPECTED_ID"
    echo "3. If app doesn't exist:"
    echo "   - Click 'Add app' → Android"
    echo "   - Package name: $EXPECTED_ID"
    echo "   - App nickname: NXT1 Sports Android ($env)"
    echo "   - SHA-1 fingerprints: (get from Android debug/release keystore)"
    echo "4. Click 'google-services.json' download button"
    echo "5. Save to: $CONFIG_DIR/$env/android/google-services.json"
    echo ""
    echo -e "${BLUE}🔐 SHA-1 Fingerprint Commands:${NC}"
    echo "Debug keystore:"
    echo "keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android"
    echo ""
    echo "Release keystore (if you have one):"
    echo "keytool -list -v -keystore /path/to/your/release.keystore -alias your_key_alias"
    echo ""
}

# Main verification
check_staging=false
check_production=false

if [[ $# -eq 0 ]]; then
    # Check all environments
    check_staging=true
    check_production=true
else
    # Check specified environments
    for env in "$@"; do
        if [[ "$env" == "staging" ]]; then
            check_staging=true
        elif [[ "$env" == "production" ]]; then
            check_production=true
        else
            echo -e "${RED}❌ Invalid environment: $env${NC}"
            echo "Valid environments: staging, production"
            exit 1
        fi
    done
fi

staging_ios_ok=true
staging_android_ok=true
production_ios_ok=true
production_android_ok=true

# Check staging
if [[ "$check_staging" == true ]]; then
    echo -e "${YELLOW}🧪 STAGING ENVIRONMENT${NC}"
    echo -e "${YELLOW}=====================${NC}"
    
    check_ios_config "staging" || staging_ios_ok=false
    check_android_config "staging" || staging_android_ok=false
    
    if [[ "$staging_ios_ok" == false ]] || [[ "$staging_android_ok" == false ]]; then
        show_download_instructions "staging"
    fi
fi

# Check production
if [[ "$check_production" == true ]]; then
    echo -e "${YELLOW}🚀 PRODUCTION ENVIRONMENT${NC}"
    echo -e "${YELLOW}=========================${NC}"
    
    check_ios_config "production" || production_ios_ok=false
    check_android_config "production" || production_android_ok=false
    
    if [[ "$production_ios_ok" == false ]] || [[ "$production_android_ok" == false ]]; then
        show_download_instructions "production"
    fi
fi

# Summary
echo -e "${BLUE}📋 VERIFICATION SUMMARY${NC}"
echo -e "${BLUE}=======================${NC}"

if [[ "$check_staging" == true ]]; then
    if [[ "$staging_ios_ok" == true ]] && [[ "$staging_android_ok" == true ]]; then
        echo -e "${GREEN}✅ Staging: All configurations correct${NC}"
    else
        echo -e "${RED}❌ Staging: Configuration issues found${NC}"
    fi
fi

if [[ "$check_production" == true ]]; then
    if [[ "$production_ios_ok" == true ]] && [[ "$production_android_ok" == true ]]; then
        echo -e "${GREEN}✅ Production: All configurations correct${NC}"
    else
        echo -e "${RED}❌ Production: Configuration issues found${NC}"
    fi
fi

echo ""

# Exit with error if any config is wrong
if [[ "$staging_ios_ok" == false ]] || [[ "$staging_android_ok" == false ]] || \
   [[ "$production_ios_ok" == false ]] || [[ "$production_android_ok" == false ]]; then
    echo -e "${YELLOW}⚠️ Please fix configuration issues before proceeding${NC}"
    exit 1
else
    echo -e "${GREEN}🎉 All Firebase configurations are correct!${NC}"
    exit 0
fi